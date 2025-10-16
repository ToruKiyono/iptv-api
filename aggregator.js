const fs = require('fs');
const axios = require('axios');
const { createLogger } = require('./logger');

class IPTVAggregator {
  constructor(options = {}) {
    this.logger = options.logger || createLogger({ module: 'aggregator' });
    this.networkLogger = this.logger.child({ scope: 'network' });
    this.parserLogger = this.logger.child({ scope: 'parser' });
    this.channels = new Map(); // 使用 Map 存储频道，key: 名称, value: [channel objects]
    this.aliases = new Map(); // 别名映射，key: 别名, value: 标准名称
    this.logos = new Map(); // Logo 映射，key: 频道名称, value: logo URL
    this.epgUrls = []; // EPG 订阅地址列表
    this.totalStreams = 0;
  }

  /**
   * 读取 EPG 配置文件
   */
  loadEPG(epgFile = 'epg.txt') {
    try {
      if (!fs.existsSync(epgFile)) {
        this.logger.info({ epgFile }, 'EPG 文件不存在，跳过处理');
        return;
      }

      const content = fs.readFileSync(epgFile, 'utf-8');
      const lines = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      this.epgUrls = lines;
      this.logger.info({ epgCount: this.epgUrls.length, epgFile }, 'EPG 订阅地址加载完成');
    } catch (error) {
      this.logger.error({ err: error, epgFile }, '读取 EPG 文件失败');
    }
  }

  /**
   * 读取 Logo 配置文件（可选）
   */
  loadLogos(logoFile = 'logo.txt') {
    try {
      if (!fs.existsSync(logoFile)) {
        this.logger.info({ logoFile }, 'Logo 文件不存在，跳过处理');
        return;
      }

      const content = fs.readFileSync(logoFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));

      lines.forEach(line => {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length >= 2) {
          const channelName = parts[0];
          const logoUrl = parts[1];
          this.logos.set(channelName, logoUrl);
        } else {
          this.parserLogger.warn({ line }, 'Logo 配置格式不正确');
        }
      });

      this.logger.info({ logoFile, logoCount: this.logos.size }, 'Logo 配置加载完成');
    } catch (error) {
      this.logger.error({ err: error, logoFile }, '读取 Logo 文件失败');
    }
  }

  /**
   * 获取频道 Logo
   */
  getLogo(channelName) {
    return this.logos.get(channelName) || '';
  }

  /**
   * 读取别名配置文件
   */
  loadAliases(aliasFile = 'alias.txt') {
    try {
      if (!fs.existsSync(aliasFile)) {
        this.logger.info({ aliasFile }, '别名文件不存在，跳过处理');
        return;
      }

      const content = fs.readFileSync(aliasFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      lines.forEach(line => {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length < 2) {
          this.parserLogger.warn({ line }, '别名配置缺少别名');
          return;
        }

        const standardName = parts[0]; // 第一个是标准名称
        const aliases = parts.slice(1); // 其余的是别名

        aliases.forEach(alias => {
          this.aliases.set(alias.toLowerCase(), standardName);
        });
      });

      this.logger.info({ aliasFile, aliasCount: this.aliases.size }, '别名规则加载完成');
    } catch (error) {
      this.logger.error({ err: error, aliasFile }, '读取别名文件失败');
    }
  }

  /**
   * 根据别名获取标准名称
   */
  getStandardName(name) {
    const lowerName = name.toLowerCase();

    // 精确匹配
    if (this.aliases.has(lowerName)) {
      return this.aliases.get(lowerName);
    }

    // 模糊匹配（包含关系）
    for (const [alias, standardName] of this.aliases.entries()) {
      if (lowerName.includes(alias) || alias.includes(lowerName)) {
        return standardName;
      }
    }

    return name; // 没有匹配到别名，返回原名称
  }

  /**
   * 解析 M3U 格式的内容（解析完整属性）
   */
  parseM3U(content) {
    const lines = content.split('\n');
    const channels = [];
    let currentChannel = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('#EXTINF:')) {
        // 解析 #EXTINF 行的所有属性
        // 格式: #EXTINF:-1 tvg-name="xxx" tvg-logo="xxx" group-title="xxx",频道名称

        const extinfMatch = line.match(/#EXTINF:(-?\d+)(.+),(.+)$/);
        if (extinfMatch) {
          const duration = extinfMatch[1];
          const attributes = extinfMatch[2].trim();
          const channelName = extinfMatch[3].trim();

          currentChannel = {
            name: channelName,
            url: null,
            duration: duration,
            tvgName: '',
            tvgLogo: '',
            groupTitle: '',
            tvgId: '',
            rawAttributes: attributes
          };

          // 解析 tvg-name
          const tvgNameMatch = attributes.match(/tvg-name="([^"]*)"/);
          if (tvgNameMatch) {
            currentChannel.tvgName = tvgNameMatch[1];
          }

          // 解析 tvg-logo
          const tvgLogoMatch = attributes.match(/tvg-logo="([^"]*)"/);
          if (tvgLogoMatch) {
            currentChannel.tvgLogo = tvgLogoMatch[1];
          }

          // 解析 group-title
          const groupTitleMatch = attributes.match(/group-title="([^"]*)"/);
          if (groupTitleMatch) {
            currentChannel.groupTitle = groupTitleMatch[1];
          }

          // 解析 tvg-id
          const tvgIdMatch = attributes.match(/tvg-id="([^"]*)"/);
          if (tvgIdMatch) {
            currentChannel.tvgId = tvgIdMatch[1];
          }
        }
      } else if (line && !line.startsWith('#') && currentChannel) {
        // 这是 URL 行
        currentChannel.url = line;
        channels.push(currentChannel);
        currentChannel = null;
      }
    }

    return channels;
  }

  /**
   * 解析 TXT 格式的内容（格式：频道名,url）
   */
  parseTXT(content) {
    const lines = content.split('\n').filter(line => line.trim());
    const channels = [];

    lines.forEach(line => {
      const parts = line.split(',');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const url = parts.slice(1).join(',').trim(); // 处理 URL 中可能包含逗号的情况

        if (name && url) {
          channels.push({
            name,
            url,
            duration: '-1',
            tvgName: '',
            tvgLogo: '',
            groupTitle: '',
            tvgId: '',
            rawAttributes: ''
          });
        }
      }
    });

    return channels;
  }

  /**
   * 从订阅地址获取频道列表
   */
  async fetchSubscription(url) {
    try {
      this.networkLogger.info({ url }, '开始拉取订阅');
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const content = response.data;
      let channels = [];

      // 判断内容格式
      if (content.includes('#EXTM3U') || content.includes('#EXTINF:')) {
        channels = this.parseM3U(content);
      } else {
        channels = this.parseTXT(content);
      }

      if (channels.length === 0) {
        this.networkLogger.warn({ url }, '订阅返回空频道列表');
      } else {
        this.networkLogger.info({ url, channelCount: channels.length }, '订阅获取完成');
      }
      return channels;
    } catch (error) {
      this.networkLogger.error({
        url,
        err: error,
        code: error.code,
        status: error.response ? error.response.status : undefined
      }, '获取订阅失败');
      return [];
    }
  }

  /**
   * 添加频道到列表（支持多源，存储完整属性）
   */
  addChannel(channelObj) {
    if (!channelObj || !channelObj.name || !channelObj.url) return;

    // 应用别名规则
    const standardName = this.getStandardName(channelObj.name);

    // 如果频道不存在，创建空数组
    if (!this.channels.has(standardName)) {
      this.channels.set(standardName, []);
    }

    const channelList = this.channels.get(standardName);

    // 去重：如果 URL 已存在，不重复添加
    const exists = channelList.some(ch => ch.url === channelObj.url);
    if (!exists) {
      // 保留原始属性，但使用标准名称
      channelList.push({
        ...channelObj,
        name: standardName
      });
    }
  }

  /**
   * 处理所有订阅
   */
  async processSubscriptions(subscribeFile = 'subscribe.txt') {
    try {
      if (!fs.existsSync(subscribeFile)) {
        this.logger.error({ subscribeFile }, '订阅文件不存在');
        return;
      }

      const content = fs.readFileSync(subscribeFile, 'utf-8');
      const urls = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      this.logger.info({ subscribeFile, urlCount: urls.length }, '订阅地址解析完成');

      // 并发获取所有订阅
      const results = await Promise.all(
        urls.map(url => this.fetchSubscription(url))
      );

      // 合并所有频道
      results.forEach(channels => {
        channels.forEach(channelObj => {
          this.addChannel(channelObj);
        });
      });

      this.logger.info({ channelCount: this.channels.size }, '订阅聚合完成');

      // 统计总源数
      let totalUrls = 0;
      for (const channelList of this.channels.values()) {
        totalUrls += channelList.length;
      }
      this.totalStreams = totalUrls;
      this.logger.info({ streamCount: totalUrls }, '频道源统计完成');
    } catch (error) {
      this.logger.error({ err: error, subscribeFile }, '处理订阅失败');
    }
  }

  /**
   * 读取模版文件
   */
  loadTemplate(templateFile = 'template.txt') {
    try {
      if (!fs.existsSync(templateFile)) {
        this.logger.warn({ templateFile }, '模版文件不存在，使用默认格式');
        return null;
      }

      const content = fs.readFileSync(templateFile, 'utf-8');
      const categories = [];
      let currentCategory = null;

      const lines = content.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();

        // 跳过空行
        if (!trimmed) return;

        // 分类标题行
        if (trimmed.includes(',#genre#')) {
          if (currentCategory) {
            categories.push(currentCategory);
          }
          currentCategory = {
            title: trimmed.replace(',#genre#', '').trim(),
            channels: []
          };
          if (!currentCategory.title) {
            this.parserLogger.warn({ line }, '模板分类名称为空');
          }
        } else if (currentCategory) {
          // 频道名称行
          currentCategory.channels.push(trimmed);
        } else {
          this.parserLogger.warn({ line }, '模板中的频道缺少分类');
        }
      });

      // 添加最后一个分类
      if (currentCategory) {
        categories.push(currentCategory);
      }

      this.logger.info({ templateFile, categoryCount: categories.length }, '模板加载完成');
      return categories;
    } catch (error) {
      this.logger.error({ err: error, templateFile }, '读取模版文件失败');
      return null;
    }
  }

  /**
   * 根据模版导出 M3U 格式（支持多源、完整属性和 EPG）
   */
  exportM3UWithTemplate(templateFile = 'template.txt', outputFile = 'output.m3u') {
    const template = this.loadTemplate(templateFile);

    if (!template) {
      // 没有模版，使用默认格式
      this.exportM3U(outputFile);
      return;
    }

    let content = '#EXTM3U\n';

    // 添加 EPG 地址（如果有）
    if (this.epgUrls.length > 0) {
      content += `#EXTM3U x-tvg-url="${this.epgUrls.join(',')}"\n`;
    }

    let totalMatched = 0;

    template.forEach(category => {
      // 添加分类标题
      content += `\n${category.title},#genre#\n`;

      // 提取分类名称（去除 ,#genre# 后缀）
      const categoryName = category.title.replace(',#genre#', '').trim();

      category.channels.forEach(channelName => {
        // 在聚合的频道中查找匹配的所有频道对象
        const channelObjs = this.findChannelObjects(channelName);

        if (channelObjs.length > 0) {
          // 输出所有匹配的源（支持 TVBox 自动换源）
          channelObjs.forEach(ch => {
            // 使用订阅源中的属性，如果没有则使用配置的 Logo
            const tvgName = ch.tvgName || channelName;
            const tvgLogo = ch.tvgLogo || this.getLogo(channelName);
            // group-title 使用 template.txt 中定义的分类名称
            const groupTitle = categoryName;
            const tvgId = ch.tvgId;

            // 构建属性字符串
            let attrs = '';
            if (tvgName) attrs += ` tvg-name="${tvgName}"`;
            if (tvgLogo) attrs += ` tvg-logo="${tvgLogo}"`;
            if (groupTitle) attrs += ` group-title="${groupTitle}"`;
            if (tvgId) attrs += ` tvg-id="${tvgId}"`;

            content += `#EXTINF:${ch.duration}${attrs},${channelName}\n${ch.url}\n`;
            totalMatched++;
          });
        }
      });
    });

    fs.writeFileSync(outputFile, content, 'utf-8');
    this.logger.info({ outputFile, matchedStreams: totalMatched }, '已根据模板导出 M3U 文件');
  }

  /**
   * 查找频道所有对象（支持模糊匹配和多源）
   */
  findChannelObjects(templateName) {
    const lowerTemplateName = templateName.toLowerCase().replace(/\s+/g, '');
    const matchedChannels = [];

    // 1. 精确匹配
    if (this.channels.has(templateName)) {
      return this.channels.get(templateName);
    }

    // 2. 不区分大小写匹配
    for (const [name, channelList] of this.channels.entries()) {
      if (name.toLowerCase() === templateName.toLowerCase()) {
        return channelList;
      }
    }

    // 3. 模糊匹配（去除空格和特殊字符）
    for (const [name, channelList] of this.channels.entries()) {
      const lowerName = name.toLowerCase().replace(/\s+/g, '');

      // 包含关系匹配
      if (lowerName.includes(lowerTemplateName) || lowerTemplateName.includes(lowerName)) {
        matchedChannels.push(...channelList);
      }
    }

    return matchedChannels;
  }

  /**
   * 查找频道 URL（支持模糊匹配）- 仅返回第一个 URL
   * @deprecated 使用 findChannelObjects 替代
   */
  findChannelUrl(templateName) {
    const channelObjs = this.findChannelObjects(templateName);
    return channelObjs.length > 0 ? channelObjs[0].url : null;
  }

  /**
   * 获取当前聚合后的频道源数量
   */
  getStreamCount() {
    if (this.totalStreams) {
      return this.totalStreams;
    }

    let total = 0;
    for (const channelList of this.channels.values()) {
      total += channelList.length;
    }
    this.totalStreams = total;
    return total;
  }

  /**
   * 导出为 M3U 格式（默认格式，不使用模版，支持完整属性和 EPG）
   */
  exportM3U(outputFile = 'output.m3u') {
    let content = '#EXTM3U\n';

    // 添加 EPG 地址（如果有）
    if (this.epgUrls.length > 0) {
      content += `#EXTM3U x-tvg-url="${this.epgUrls.join(',')}"\n`;
    }

    // 按频道名称排序
    const sortedChannels = Array.from(this.channels.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'));

    sortedChannels.forEach(([name, channelList]) => {
      // 输出该频道的所有源
      channelList.forEach(ch => {
        const tvgName = ch.tvgName || name;
        const tvgLogo = ch.tvgLogo || this.getLogo(name);
        const groupTitle = ch.groupTitle;
        const tvgId = ch.tvgId;

        // 构建属性字符串
        let attrs = '';
        if (tvgName) attrs += ` tvg-name="${tvgName}"`;
        if (tvgLogo) attrs += ` tvg-logo="${tvgLogo}"`;
        if (groupTitle) attrs += ` group-title="${groupTitle}"`;
        if (tvgId) attrs += ` tvg-id="${tvgId}"`;

        content += `#EXTINF:${ch.duration}${attrs},${name}\n${ch.url}\n`;
      });
    });

    fs.writeFileSync(outputFile, content, 'utf-8');
    this.logger.info({ outputFile }, '已导出默认 M3U 文件');
  }

  /**
   * 导出为 TXT 格式（支持多源）
   */
  exportTXT(outputFile = 'output.txt') {
    let content = '';

    // 按频道名称排序
    const sortedChannels = Array.from(this.channels.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'));

    sortedChannels.forEach(([name, channelList]) => {
      // 输出该频道的所有源
      channelList.forEach(ch => {
        content += `${name},${ch.url}\n`;
      });
    });

    fs.writeFileSync(outputFile, content, 'utf-8');
    this.logger.info({ outputFile }, '已导出 TXT 文件');
  }
}

// 导出类供 server.js 使用
module.exports = { IPTVAggregator };

// 主程序（仅在直接运行时执行）
async function main() {
  const aggregator = new IPTVAggregator();

  // 1. 加载 EPG 配置
  aggregator.loadEPG('epg.txt');

  // 2. 加载 Logo 配置（可选）
  aggregator.loadLogos('logo.txt');

  // 3. 加载别名配置
  aggregator.loadAliases('alias.txt');

  // 4. 处理所有订阅
  await aggregator.processSubscriptions('subscribe.txt');

  // 5. 导出结果
  aggregator.exportM3UWithTemplate('template.txt', 'output.m3u');
  aggregator.exportTXT('output.txt');

  aggregator.logger.info({}, '任务完成');
}

// 只在直接运行 index.js 时执行主程序
if (require.main === module) {
  main().catch(error => {
    const logger = createLogger({ module: 'aggregator' });
    logger.error({ err: error }, '聚合任务执行失败');
    process.exitCode = 1;
  });
}
