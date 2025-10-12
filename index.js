// CLI 入口文件
const path = require('path');
const { IPTVAggregator } = require('./aggregator');

const SOURCE_DIR = 'source';
const OUTPUT_DIR = 'output';

async function main() {
  const aggregator = new IPTVAggregator();

  // 1. 加载 EPG 配置
  aggregator.loadEPG(path.join(SOURCE_DIR, 'epg.txt'));

  // 2. 加载 Logo 配置（可选）
  aggregator.loadLogos(path.join(SOURCE_DIR, 'logo.txt'));

  // 3. 加载别名配置
  aggregator.loadAliases(path.join(SOURCE_DIR, 'alias.txt'));

  // 4. 处理所有订阅
  await aggregator.processSubscriptions(path.join(SOURCE_DIR, 'subscribe.txt'));

  // 5. 导出结果
  aggregator.exportM3UWithTemplate(
    path.join(SOURCE_DIR, 'template.txt'),
    path.join(OUTPUT_DIR, 'output.m3u')
  );
  aggregator.exportTXT(path.join(OUTPUT_DIR, 'output.txt'));

  console.log('\n任务完成！');
}

main().catch(console.error);

