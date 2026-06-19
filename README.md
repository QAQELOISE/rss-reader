# 📰 Velvet RSS · 微水泥阅读器

> 极简微水泥 × 天鹅绒艺术漆风格的 RSS 阅读器，部署于 GitHub Pages

## ✨ 功能

- 📡 **RSS/Atom 订阅** — 添加任意 RSS/Atom 源，实时或通过缓存阅读
- 🗂️ **分组管理** — 自定义分组整理订阅源，树形侧边栏导航
- 🤖 **AI 摘要** — 支持 OpenAI / Claude / 自定义 API，Key 仅存储在本地浏览器
- 📦 **OPML 导入/导出** — 一键批量迁移订阅源
- 🔍 **RSSHub 联动** — 搜索 RSSHub 路由，快速发现好内容
- 🧹 **智能全文抓取** — 自动检测摘要型 RSS，使用 Readability 提取完整正文
- 🚫 **广告清洗** — 自动移除广告 DOM、追踪参数、社交分享按钮，纯享阅读
- 📝 **Markdown 导出** — 单篇/批量导出为 Markdown，一键复制
- ⌨️ **全键盘操作** — `JK` 导航文章，`S` AI 摘要，`M` 导出，`?` 查看所有快捷键
- 🎨 **三主题切换** — 浅灰微水泥 / 深色炭质 / 护眼暖黄，配天鹅绒噪点纹理
- 📱 **移动端适配** — 响应式三栏 + 底部导航栏，手机上也能用

## 🚀 部署到 GitHub Pages

### 1. Fork / 新建仓库

```bash
git init
git add -A
git commit -m "Initial commit: Velvet RSS reader"
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

### 2. 启用 GitHub Pages

1. 进入仓库 `Settings` → `Pages`
2. `Source` 选择 `Deploy from a branch`
3. `Branch` 选择 `main`，文件夹选 `/ (root)`
4. 点击 `Save`

### 3. 启用 GitHub Actions（可选，用于 RSS 缓存）

1. 进入仓库 `Settings` → `Actions` → `General`
2. `Workflow permissions` 选择 `Read and write permissions`
3. 勾选 `Allow GitHub Actions to create and approve pull requests`

### 4. 配置订阅源缓存

编辑 `data/feeds-cache.json` 中的 `feeds` 数组，填入你的订阅源：

```json
{
  "feeds": [
    {
      "id": "feed_1",
      "title": "Hacker News",
      "url": "https://hnrss.org/frontpage",
      "group": "科技"
    },
    {
      "id": "feed_2",
      "title": "36氪",
      "url": "https://rsshub.app/36kr/newsflashes",
      "group": "新闻"
    }
  ],
  "articles": {},
  "lastUpdated": ""
}
```

GitHub Actions 每天 4 次定时抓取，并自动 `commit` + `push` 到仓库。

## 🖥️ 本地使用

```bash
# 启动本地服务器
python3 -m http.server 8080

# 打开浏览器
open http://localhost:8080
```

你也可以直接在浏览器中双击打开 `index.html`，但部分功能（如 RSS 抓取）需要 HTTP 服务。

## ⌨️ 快捷键

| 键 | 功能 | 键 | 功能 |
|---|---|---|---|
| `J` / `↓` | 下一篇文章 | `K` / `↑` | 上一篇文章 |
| `S` | AI 摘要 | `M` | 导出 Markdown |
| `R` | 刷新当前源 | `Esc` | 关闭弹窗/退出阅读模式 |
| `?` | 快捷键帮助 | | |

## 🔒 隐私说明

- **API Key** 仅存储在浏览器 `localStorage` 中，**不会上传到 GitHub**
- 所有 AI 请求**直接从浏览器**发送至对应 API 服务商
- 无后端，无分析追踪，无第三方数据收集

## 🛠️ 技术栈

- Vue 3 (CDN)
- Readability.js — 正文提取
- Turndown.js — HTML → Markdown
- DOMPurify — XSS 防护
- GitHub Actions — RSS 定时缓存

## 📂 项目结构

```
rss-reader/
├── index.html              # 主页面（Vue 3 SPA）
├── app.js                  # 核心逻辑
├── style.css               # 微水泥主题样式
├── .github/
│   └── workflows/
│       └── update-feeds.yml  # RSS 缓存工作流
├── data/
│   └── feeds-cache.json     # 缓存数据
└── README.md
```

## 📄 License

MIT
