# 小豆邀请码抓码站


## 文件结构

```text
xiaodou_frontend/
├── index.html
├── style.css
├── app.js
├── data/
│   └── codes.json
└── assets/
    └── group-qr-placeholder.svg
```

## 本地预览

最简单方式：双击 `index.html` 打开。部分浏览器会限制 `file://` 下的 JSON fetch，因此建议用 VS Code 的 Live Server 插件，或在项目目录运行：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000`。这里的 Python 仅用于本地静态文件预览，不是网站后端，也不需要部署 Python 服务。

## 发布到 GitHub Pages

1. 在 GitHub 创建一个公开仓库，例如 `xiaodou-codes`。
2. 将本项目中的所有文件上传到仓库根目录，确保 `index.html` 位于根目录。
3. 打开仓库 `Settings` → `Pages`。
4. 在 `Build and deployment` 中选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/(root)`，点击 `Save`。
6. 等待 GitHub Pages 发布完成，访问 GitHub Pages 给出的地址，例如 `https://用户名.github.io/xiaodou-codes/`。

## 更新邀请码

编辑 `data/codes.json`，按下面格式增加记录：

```json
{
  "code": "A1B2C3",
  "status": "available",
  "source": "LINUX DO / 帖子标题",
  "author": "发布者",
  "created_at": "2026-11-26T17:05:00+08:00"
}
```

`status` 可选值：
- `available`：可能可用
- `used`：已使用
- `verify`：待确认
- `tried`：试过（也可以在浏览器中点击“我试过”，这类标记保存在当前浏览器）

修改 JSON 后提交到 GitHub，GitHub Pages 会更新静态数据。网页端每 20 秒重新读取 JSON，但这只是刷新展示，不会自动从社交平台抓码。

## 群聊二维码

将自己的二维码图片放入 `assets`，并修改 `index.html` 中两处 `group-qr-placeholder.svg` 的路径即可。SVG 占位图只是示意，不是真实二维码。

## 重要限制

- 纯前端 GitHub Pages 没有后端定时任务，不能在无人访问时自动运行爬虫。
- 浏览器跨域策略、登录态和平台风控会限制直接抓取社交平台。
- 本机手动添加的码和“我试过”状态仅保存在当前浏览器 localStorage，其他访问者看不到。
- 需要全站共享状态或自动更新 JSON 时，需要通过人工提交数据，或另行接入 GitHub Actions/受允许的数据 API；那属于额外的数据更新流程。
- 示例邀请码仅用于页面演示，不代表真实可用。
