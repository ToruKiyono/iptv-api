const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { IPTVAggregator } = require('./aggregator');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'default_admin_token';

// 中间件
app.use(cors());
app.use(express.json());

// 日志中间件
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
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
  const m3uPath = path.join(__dirname, 'output.m3u');

  if (!fs.existsSync(m3uPath)) {
    return res.status(404).json({ error: 'M3U 文件不存在，请先触发更新' });
  }

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Content-Disposition', 'inline; filename="playlist.m3u"');
  res.sendFile(m3uPath);
});

// 获取 TXT 文件
app.get('/playlist.txt', (req, res) => {
  const txtPath = path.join(__dirname, 'output.txt');

  if (!fs.existsSync(txtPath)) {
    return res.status(404).json({ error: 'TXT 文件不存在，请先触发更新' });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(txtPath);
});

// 触发更新（需要 token）
app.post('/update', verifyToken, async (req, res) => {
  if (isUpdating) {
    return res.status(409).json({
      error: '更新正在进行中',
      message: '请稍后再试'
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
    console.log('开始更新频道列表...');
    const aggregator = new IPTVAggregator();

    // 加载配置
    aggregator.loadEPG('epg.txt');
    aggregator.loadLogos('logo.txt');
    aggregator.loadAliases('alias.txt');

    // 处理订阅
    await aggregator.processSubscriptions('subscribe.txt');

    // 导出结果
    aggregator.exportM3UWithTemplate('template.txt', 'output.m3u');
    aggregator.exportTXT('output.txt');

    lastUpdateTime = new Date().toISOString();
    lastUpdateStatus = {
      success: true,
      channelCount: aggregator.channels.size,
      timestamp: lastUpdateTime
    };

    console.log('频道列表更新完成');
  } catch (error) {
    console.error('更新失败:', error);
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
    files: {
      m3u: fs.existsSync('output.m3u'),
      txt: fs.existsSync('output.txt')
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
      'POST /update': '触发更新（需要 token）'
    },
    usage: {
      update: 'POST /update -H "Authorization: Bearer YOUR_TOKEN"',
      updateQuery: 'POST /update?token=YOUR_TOKEN'
    }
  });
});

// 启动时自动更新一次
async function initUpdate() {
  console.log('启动时自动更新频道列表...');
  isUpdating = true;

  try {
    const aggregator = new IPTVAggregator();
    aggregator.loadEPG('epg.txt');
    aggregator.loadLogos('logo.txt');
    aggregator.loadAliases('alias.txt');
    await aggregator.processSubscriptions('subscribe.txt');
    aggregator.exportM3UWithTemplate('template.txt', 'output.m3u');
    aggregator.exportTXT('output.txt');

    lastUpdateTime = new Date().toISOString();
    lastUpdateStatus = {
      success: true,
      channelCount: aggregator.channels.size,
      timestamp: lastUpdateTime
    };

    console.log('初始更新完成');
  } catch (error) {
    console.error('初始更新失败:', error);
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
  console.log(`IPTV Aggregator API 运行在 http://localhost:${PORT}`);
  console.log(`Admin Token: ${ADMIN_TOKEN}`);
  console.log('='.repeat(50));

  // 启动时自动更新
  await initUpdate();
});
