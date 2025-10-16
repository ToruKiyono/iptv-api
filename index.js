// CLI 入口文件
const path = require('path');
const { IPTVAggregator } = require('./aggregator');
const { validateSourceConfigs } = require('./configValidator');
const { logger } = require('./logger');

const SOURCE_DIR = 'source';
const OUTPUT_DIR = 'output';

async function main() {
  const cliLogger = logger.child({ module: 'cli' });
  const aggregator = new IPTVAggregator({ logger: logger.child({ module: 'aggregator', trigger: 'cli' }) });

  const configFiles = {
    epg: path.join(SOURCE_DIR, 'epg.txt'),
    logo: path.join(SOURCE_DIR, 'logo.txt'),
    alias: path.join(SOURCE_DIR, 'alias.txt'),
    subscribe: path.join(SOURCE_DIR, 'subscribe.txt'),
    template: path.join(SOURCE_DIR, 'template.txt')
  };

  const validation = validateSourceConfigs(configFiles);
  if (validation.hasErrors) {
    cliLogger.error({ errors: validation.errors }, '配置校验失败，终止执行');
    process.exitCode = 1;
    return;
  }

  if (validation.warnings.length > 0) {
    cliLogger.warn({ warnings: validation.warnings }, '配置存在警告');
  }

  // 1. 加载 EPG 配置
  aggregator.loadEPG(configFiles.epg);

  // 2. 加载 Logo 配置（可选）
  aggregator.loadLogos(configFiles.logo);

  // 3. 加载别名配置
  aggregator.loadAliases(configFiles.alias);

  // 4. 处理所有订阅
  await aggregator.processSubscriptions(configFiles.subscribe);

  // 5. 导出结果
  aggregator.exportM3UWithTemplate(
    configFiles.template,
    path.join(OUTPUT_DIR, 'output.m3u')
  );
  aggregator.exportTXT(path.join(OUTPUT_DIR, 'output.txt'));

  cliLogger.info({ channelCount: aggregator.channels.size, streamCount: aggregator.getStreamCount() }, '任务完成');
}

main().catch(error => {
  logger.error({ module: 'cli', err: error }, 'CLI 执行失败');
  process.exitCode = 1;
});

