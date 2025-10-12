# IPTV 源聚合工具

简易的 IPTV 订阅源聚合工具，支持从多个订阅源获取电视台列表，并通过别名统一频道名称，最终导出为 M3U 或 TXT 格式。

## 功能特性

- 📺 支持读取多个订阅地址
- 🔄 自动解析 M3U 和 TXT 两种格式
- 🏷️ 支持频道别名统一命名
- 📤 导出 M3U 和 TXT 两种格式
- 🚀 并发获取订阅源，提高效率
- 🔧 自动去重，保留最新的频道地址

## 安装依赖

```bash
npm install
```

## 配置文件

### subscribe.txt

订阅地址文件，一行一个订阅地址。支持 M3U 和 TXT 格式的订阅源。

```
# 示例
http://example.com/iptv.m3u
https://example.com/channels.txt
```

### alias.txt

别名配置文件，用于统一频道名称。格式：`标准名称,别名1,别名2,别名3...`

```
CCTV1,cctv1,CCTV-1,央视1,中央1台,CCTV1综合
CCTV5,cctv5,CCTV-5,央视5,中央5台,CCTV5体育
湖南卫视,湖南卫视高清,湖南台,HunanTV
浙江卫视,浙江卫视高清,浙江台
```

## 使用方法

1. 编辑 `subscribe.txt`，添加你的订阅地址
2. 编辑 `alias.txt`，配置频道别名规则（可选）
3. 运行程序：

```bash
npm start
```

4. 程序会自动生成以下文件：
   - `output.m3u` - M3U 格式的播放列表
   - `output.txt` - TXT 格式的频道列表

## 输出格式

### M3U 格式 (output.m3u)

```
#EXTM3U
#EXTINF:-1,CCTV1
http://example.com/cctv1.m3u8
#EXTINF:-1,湖南卫视
http://example.com/hunan.m3u8
```

### TXT 格式 (output.txt)

```
CCTV1,http://example.com/cctv1.m3u8
湖南卫视,http://example.com/hunan.m3u8
```

## 工作原理

1. 读取 `alias.txt` 加载别名规则
2. 读取 `subscribe.txt` 获取所有订阅地址
3. 并发请求所有订阅源
4. 解析订阅内容（自动识别 M3U 或 TXT 格式）
5. 应用别名规则统一频道名称
6. 自动去重（相同名称的频道保留最新的）
7. 按名称排序后导出为 M3U 和 TXT 格式

## 注意事项

- 订阅地址需要可公开访问
- 频道别名支持精确匹配和模糊匹配
- 相同名称的频道会自动去重，保留最新获取的地址
- 输出的频道列表会按名称排序

## License

MIT
