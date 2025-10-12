// CLI 入口文件
const { IPTVAggregator } = require('./aggregator');

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

  console.log('\n任务完成！');
}

main().catch(console.error);
