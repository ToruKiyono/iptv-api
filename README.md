# IPTV 源聚合工具

简易的 IPTV 订阅源聚合工具，支持从多个订阅源获取电视台列表，并通过别名统一频道名称，最终导出为 M3U 或 TXT 格式。

**现已支持 Web API 和 Docker 部署！**

## 功能特性

- 📺 支持读取多个订阅地址
- 🔄 自动解析 M3U 和 TXT 两种格式
- 🎯 完整解析 M3U 属性（tvg-name, tvg-logo, group-title, tvg-id）
- 🏷️ 支持频道别名统一命名
- 📤 导出 M3U 和 TXT 两种格式
- 🚀 并发获取订阅源，提高效率
- 🔧 支持多源输出，自动去重
- 📡 支持 EPG（电子节目单）配置
- 📋 根据模版输出分类频道列表
- 🔄 支持 TVBox 自动换源
- 🌐 **Web API 支持**
- 🐳 **Docker 一键部署**
- 🔐 **Token 认证保护**

## 快速开始

### 方式一：Docker 部署（推荐）

1. **克隆项目**
```bash
git clone <your-repo-url>
cd iptv-api
```

2. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env 文件，设置你的 ADMIN_TOKEN
```

3. **启动服务**
```bash
docker-compose up -d
```

4. **访问 API**
```bash
# 获取播放列表
curl http://localhost:3000/playlist.m3u

# 触发更新
curl -X POST http://localhost:3000/update \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 方式二：本地运行

1. **安装依赖**
```bash
npm install
```

2. **配置文件**
- 编辑 `subscribe.txt` 添加订阅地址
- 编辑 `alias.txt` 配置频道别名
- 编辑 `template.txt` 配置输出模版
- 编辑 `epg.txt` 配置 EPG 地址

3. **启动方式**

```bash
# Web 服务模式
npm start

# CLI 模式（一次性执行）
npm run cli
```

## API 接口

### 1. 健康检查
```bash
GET /health
```

### 2. 获取播放列表
```bash
# M3U 格式
GET /playlist.m3u

# TXT 格式
GET /playlist.txt
```

### 3. 触发更新（需要 token）
```bash
POST /update
Authorization: Bearer YOUR_TOKEN

# 或使用 query 参数
POST /update?token=YOUR_TOKEN
```

### 4. 获取状态
```bash
GET /status
```

### 5. API 文档
```bash
GET /
```

## 配置文件

### subscribe.txt
订阅地址文件，一行一个订阅地址。支持 M3U 和 TXT 格式。

```
# 示例
https://example.com/iptv.m3u
https://example.com/channels.txt
```

### alias.txt
别名配置文件，用于统一频道名称。格式：`标准名称,别名1,别名2,别名3...`

```
CCTV-1,CCTV1,cctv1,央视1,中央1台
翡翠台,翡翠台4K,[BD]翡翠,[HD]翡翠
```

### template.txt
输出模版文件，定义频道分类和顺序。

```
📺央视频道,#genre#
CCTV-1
CCTV-2

🌊港·澳·台,#genre#
翡翠台
明珠台
```

### epg.txt
EPG（电子节目单）订阅地址。

```
http://epg.51zmt.top:8000/e.xml
https://e.erw.cc/e.xml
```

### logo.txt（可选）
频道 Logo 配置文件。

```
CCTV-1,https://example.com/logo/cctv1.png
翡翠台,https://example.com/logo/jade.png
```

## Docker 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `ADMIN_TOKEN` | API 认证 Token | `change_me_in_production` |

## 输出格式示例

### M3U 格式
```m3u
#EXTM3U
#EXTM3U x-tvg-url="http://epg.51zmt.top:8000/e.xml"

📺央视频道,#genre#
#EXTINF:-1 tvg-name="CCTV1" tvg-logo="https://..." group-title="📺央视频道",CCTV-1
http://source1.com/cctv1
#EXTINF:-1 tvg-name="CCTV1" tvg-logo="https://..." group-title="📺央视频道",CCTV-1
http://source2.com/cctv1

🌊港·澳·台,#genre#
#EXTINF:-1 tvg-name="翡翠台" tvg-logo="https://..." group-title="🌊港·澳·台",翡翠台
http://example.com/jade
```

## 工作原理

1. 读取 `epg.txt` 加载 EPG 配置
2. 读取 `logo.txt` 加载 Logo 配置（可选）
3. 读取 `alias.txt` 加载别名规则
4. 读取 `subscribe.txt` 获取所有订阅地址
5. 并发请求所有订阅源
6. 解析订阅内容（自动识别 M3U 或 TXT 格式）
7. 解析完整的 M3U 属性（tvg-name, tvg-logo, group-title, tvg-id）
8. 应用别名规则统一频道名称
9. 支持多源输出（相同频道的不同源都会保留，支持 TVBox 自动换源）
10. 根据 template.txt 模版输出分类频道列表
11. group-title 使用模版中定义的分类名称
12. 导出为 M3U 和 TXT 格式

## Docker 命令

```bash
# 构建镜像
docker build -t iptv-aggregator .

# 运行容器
docker run -d \
  -p 3000:3000 \
  -e ADMIN_TOKEN=your_token \
  --name iptv-api \
  iptv-aggregator

# 查看日志
docker logs -f iptv-api

# 停止容器
docker stop iptv-api

# 使用 docker-compose
docker-compose up -d
docker-compose logs -f
docker-compose down
```

## TVBox 配置

在 TVBox 中使用聚合后的播放列表：

```json
{
  "lives": [
    {
      "name": "IPTV 聚合",
      "type": 0,
      "url": "http://your-server:3000/playlist.m3u",
      "epg": "http://epg.51zmt.top:8000/e.xml"
    }
  ]
}
```

## 定时更新

可以使用 cron 或其他定时任务工具定期触发更新：

```bash
# 每小时更新一次
0 * * * * curl -X POST http://localhost:3000/update?token=YOUR_TOKEN
```

## 注意事项

- 订阅地址需要可公开访问
- 频道别名支持精确匹配和模糊匹配
- 相同名称的不同源会全部保留，支持自动换源
- group-title 会使用 template.txt 中定义的分类名称
- Docker 部署时请务必修改默认的 ADMIN_TOKEN

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# CLI 模式
npm run cli
```

## License

MIT
