# NanoTune

NanoTune 是一个轻量的网页音乐播放器，提供搜索、播放、歌词、收藏、播放队列、封面取色和移动端竖屏界面。项目可以直接以 Node.js 服务运行，也可以通过 Docker 部署。

## 功能特点

- 多来源音乐搜索，支持把搜索结果加入播放队列。
- 播放列表和收藏列表独立管理，支持导入、导出、批量清空。
- 自动获取专辑封面，并根据封面颜色调整界面配色。
- 同步歌词滚动显示，当前播放行会高亮聚焦。
- 移动端采用竖屏播放页布局，封面、歌词和播放控制适配手机屏幕。
- 支持播放进度、音量、循环、随机、上一首、下一首等基础控制。
- 支持访问密码，适合部署到公网服务器。
- 使用 SQLite 持久化播放数据和收藏数据。

## 目录结构

```text
.
├── index.html              # 主播放界面
├── login.html              # 登录页
├── css/                    # 样式文件
├── js/                     # 前端逻辑
├── functions/              # Cloudflare Pages Functions 版本接口
├── server/                 # 独立 Node.js 服务端
├── assets/                 # 静态资源
├── Dockerfile
└── docker-compose.yml
```

## 本地运行

需要 Node.js 22.5 或更高版本。

```bash
cd server
npm install
PASSWORD=23232333 PORT=8787 node index.js
```

启动后访问：

```text
http://127.0.0.1:8787/login
```

如果不想启用访问密码，可以不设置 `PASSWORD`。

## Docker 部署

创建或修改 `docker-compose.yml`：

```yaml
services:
  nanotune:
    build: .
    image: nanotune:local
    container_name: nanotune
    restart: always
    init: true
    ports:
      - "8080:8787"
    environment:
      - PASSWORD=your_secure_password_here
      - MUSIC_API_PROVIDER=j8y
      - J8Y_APP_KEY=replace_with_your_own_key
      - J8Y_API_BASE=https://api.j8y.cn/api/gateway.php
      - J8Y_API_PATHS=wy_music,znnu_music
      - J8Y_LEVEL=standard
      - API_BASE_URL=https://music-api.gdstudio.xyz/api.php
    volumes:
      - ./data:/data
```

启动：

```bash
docker compose up -d --build
```

访问：

```text
http://服务器IP:8080/login
```

## Android App

仓库内置了原生 Android 工程，位于 `android/` 目录。App 使用 Kotlin、Jetpack Compose 和 Media3 实现，不依赖 WebView。默认连接：

```text
http://180.76.145.83:8080/login
```

GitHub Actions 会自动编译 debug APK：

1. 打开 GitHub 仓库的 **Actions** 页面。
2. 选择 **Build Android APK**。
3. 点击最新一次运行。
4. 在 **Artifacts** 中下载 `NanoTune-debug-apk`。
5. 解压后安装 `app-debug.apk`。

如果要修改默认服务器地址，编辑：

```text
android/app/src/main/java/com/toloung/nanotune/data/NanoTuneApi.kt
```

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PASSWORD` | 登录密码。留空时不启用密码保护 | 空 |
| `HOST` | Node 服务监听地址 | `0.0.0.0` |
| `PORT` | Node 服务端口 | `8787` |
| `DATA_DIR` | SQLite 数据目录 | `../data` |
| `MUSIC_API_PROVIDER` | 音乐接口提供方，支持 `default` 或 `j8y` | `default` |
| `API_BASE_URL` | 默认音乐聚合 API 地址 | `https://music-api.gdstudio.xyz/api.php` |
| `J8Y_APP_KEY` | j8y 接口密钥 | 空 |
| `J8Y_API_BASE` | j8y 接口地址 | `https://api.j8y.cn/api/gateway.php` |
| `J8Y_API_PATHS` | j8y 搜索路径列表 | `wy_music,znnu_music` |
| `J8Y_LEVEL` | j8y 音质等级 | `standard` |

## 数据持久化

独立 Node.js 服务会把数据写入 SQLite：

```text
data/nanotune.db
```

Docker 部署时建议挂载 `./data:/data`，这样容器重建后播放列表和收藏不会丢失。

## Cloudflare Pages

项目仍保留 `functions/` 目录，可以部署到 Cloudflare Pages。需要在 Cloudflare 中配置：

- 环境变量 `PASSWORD`：访问密码，可选。
- D1 数据库绑定名 `DB`：用于保存播放数据和收藏数据。

D1 初始化 SQL：

```sql
CREATE TABLE IF NOT EXISTS playback_store (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS favorites_store (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## 使用说明

1. 打开 `/login` 输入访问密码。
2. 在搜索框输入歌曲、歌手或关键词。
3. 从结果中播放歌曲，或加入播放队列。
4. 点击收藏按钮保存常听歌曲。
5. 在移动端打开时，会自动切换为竖屏播放界面。

## 开发提示

- 前端主逻辑在 `js/index.js`。
- 移动端补充逻辑在 `js/mobile.js`。
- 移动端样式在 `css/mobile.css`。
- 独立服务入口在 `server/index.js`。
- 数据库路径在 `server/db.js`。

## License

本项目仅供学习和个人使用。部署公开服务时，请自行确认所接入音乐接口和音频资源的使用权限。
