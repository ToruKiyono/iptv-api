const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { IPTVAggregator } = require('./aggregator');
const { logger } = require('./logger');
const { validateSourceConfigs } = require('./configValidator');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'default_admin_token';

const serverLogger = logger.child({ module: 'server' });
const requestLogger = logger.child({ module: 'http' });

// 文件路径配置
const SOURCE_DIR = 'source';
const OUTPUT_DIR = 'output';

const CONFIG_FILES = {
  epg: path.join(SOURCE_DIR, 'epg.txt'),
  logo: path.join(SOURCE_DIR, 'logo.txt'),
  alias: path.join(SOURCE_DIR, 'alias.txt'),
  subscribe: path.join(SOURCE_DIR, 'subscribe.txt'),
  template: path.join(SOURCE_DIR, 'template.txt')
};

const OUTPUT_FILES = {
  m3u: path.join(OUTPUT_DIR, 'output.m3u'),
  txt: path.join(OUTPUT_DIR, 'output.txt')
};

// 中间件
app.use(cors());
app.use(express.json());

// 日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    requestLogger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start
    }, 'HTTP 请求完成');
  });
  next();
});

// Token 验证中间件
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'] || req.query.token;

  if (!token) {
    return res.status(401).json({ error: '缺少 token' });
  }

  const actualToken = token.replace('Bearer ', '');

  if (actualToken !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Token 无效' });
  }

  next();
};

// 状态变量
let isUpdating = false;
let lastUpdateTime = null;
let lastUpdateStatus = null;
let lastConfigValidation = null;

function runConfigValidation() {
  lastConfigValidation = validateSourceConfigs(CONFIG_FILES);

  if (lastConfigValidation.hasErrors) {
    serverLogger.error({
      errors: lastConfigValidation.errors,
      warnings: lastConfigValidation.warnings
    }, '配置校验失败');
  } else {
    serverLogger.info({
      warnings: lastConfigValidation.warnings
    }, '配置校验通过');
  }

  return lastConfigValidation;
}

async function performUpdate(trigger) {
  const aggregator = new IPTVAggregator({ logger: logger.child({ module: 'aggregator', trigger }) });

  aggregator.loadEPG(CONFIG_FILES.epg);
  aggregator.loadLogos(CONFIG_FILES.logo);
  aggregator.loadAliases(CONFIG_FILES.alias);
  await aggregator.processSubscriptions(CONFIG_FILES.subscribe);
  aggregator.exportM3UWithTemplate(CONFIG_FILES.template, OUTPUT_FILES.m3u);
  aggregator.exportTXT(OUTPUT_FILES.txt);

  const channelCount = aggregator.channels.size;
  const streamCount = aggregator.getStreamCount();

  return { channelCount, streamCount };
}

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    lastUpdate: lastUpdateTime,
    isUpdating: isUpdating
  });
});

// 获取 M3U 文件
app.get('/playlist.m3u', (req, res) => {
  if (!fs.existsSync(OUTPUT_FILES.m3u)) {
    return res.status(404).json({ error: 'M3U 文件不存在，请先触发更新' });
  }

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Content-Disposition', 'inline; filename="playlist.m3u"');
  res.sendFile(path.resolve(OUTPUT_FILES.m3u));
});

// 获取 TXT 文件
app.get('/playlist.txt', (req, res) => {
  if (!fs.existsSync(OUTPUT_FILES.txt)) {
    return res.status(404).json({ error: 'TXT 文件不存在，请先触发更新' });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(path.resolve(OUTPUT_FILES.txt));
});

// 触发更新（需要 token）
app.post('/update', verifyToken, async (req, res) => {
  if (isUpdating) {
    return res.status(409).json({
      error: '更新正在进行中',
      message: '请稍后再试'
    });
  }

  const validation = runConfigValidation();
  if (validation.hasErrors) {
    return res.status(422).json({
      error: '配置校验失败，已阻止更新',
      details: validation.errors
    });
  }

  // 立即返回响应，异步执行更新
  res.json({
    message: '更新任务已启动',
    timestamp: new Date().toISOString()
  });

  // 异步执行更新
  isUpdating = true;

  try {
    serverLogger.info({ trigger: 'manual' }, '开始更新频道列表');
    const result = await performUpdate('manual');

    lastUpdateTime = new Date().toISOString();
    lastUpdateStatus = {
      success: true,
      ...result,
      timestamp: lastUpdateTime
    };

    serverLogger.info(result, '频道列表更新完成');
  } catch (error) {
    serverLogger.error({ err: error }, '更新失败');
    lastUpdateStatus = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  } finally {
    isUpdating = false;
  }
});

// 获取更新状态
app.get('/status', (req, res) => {
  res.json({
    isUpdating,
    lastUpdate: lastUpdateTime,
    lastUpdateStatus,
    lastConfigValidation,
    files: {
      m3u: fs.existsSync(OUTPUT_FILES.m3u),
      txt: fs.existsSync(OUTPUT_FILES.txt)
    }
  });
});

// 根路径
app.get('/', (req, res) => {
  res.json({
    name: 'IPTV Aggregator API',
    version: '1.0.0',
    endpoints: {
      'GET /health': '健康检查',
      'GET /status': '获取更新状态',
      'GET /playlist.m3u': '获取 M3U 播放列表',
      'GET /playlist.txt': '获取 TXT 频道列表',
      'POST /update': '触发更新（需要 token）',
      'POST /reload-config': '重新加载并校验配置（需要 token）'
    },
    usage: {
      update: 'POST /update -H "Authorization: Bearer YOUR_TOKEN"',
      updateQuery: 'POST /update?token=YOUR_TOKEN',
      reloadConfig: 'POST /reload-config -H "Authorization: Bearer YOUR_TOKEN"'
    }
  });
});

app.post('/reload-config', verifyToken, (req, res) => {
  const validation = runConfigValidation();

  if (validation.hasErrors) {
    return res.status(422).json({
      message: '配置存在错误，请修复后重试',
      errors: validation.errors,
      warnings: validation.warnings
    });
  }

  res.json({
    message: '配置已重新加载',
    warnings: validation.warnings,
    checkedAt: validation.checkedAt
  });
});

// 启动时自动更新一次
async function initUpdate() {
  serverLogger.info({}, '启动时自动更新频道列表');
  isUpdating = true;

  try {
    const validation = runConfigValidation();
    if (validation.hasErrors) {
      lastUpdateStatus = {
        success: false,
        error: '配置校验失败，未执行初始更新',
        timestamp: new Date().toISOString()
      };
      return;
    }

    const result = await performUpdate('startup');

    lastUpdateTime = new Date().toISOString();
    lastUpdateStatus = {
      success: true,
      ...result,
      timestamp: lastUpdateTime
    };

    serverLogger.info(result, '初始更新完成');
  } catch (error) {
    serverLogger.error({ err: error }, '初始更新失败');
    lastUpdateStatus = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  } finally {
    isUpdating = false;
  }
}

// 启动服务器
app.listen(PORT, async () => {
  serverLogger.info({ port: PORT }, 'IPTV Aggregator API 已启动');
  serverLogger.info({ tokenSet: ADMIN_TOKEN !== 'default_admin_token' }, '管理 Token 已加载');

  // 启动时自动更新
  await initUpdate();
});

