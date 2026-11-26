# 小豆邀请码抓码站（纯前端版）

这是一个可直接部署到 GitHub Pages 的静态网站，不需要 Flask、Python 后端或数据库服务器。

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


## 本次页面调整说明
- 已移除 AS纪元 / 二维码展示区域。
- 汇总区调整为三列：最后更新、下次刷新、当前收录。
- 列表移除来源列，仅保留时间、邀请码、状态和操作。
- 演示 JSON 当前包含 117 条随机格式的演示编码：95 条标记为可能可用、22 条标记为已使用；其中 32 条显示为 10 分钟内收录。
- **重要：这些随机编码是界面演示数据，不是真实邀请码，也不保证可用。** 页面每次加载时会将演示记录时间重置为相对当前时间，方便预览“最新时间”效果。正式上线时，请用真实收集并核验的数据替换 `data/codes.json`，不要把随机演示码宣传为真实可用邀请码。


## 1000条随机演示码库与轮换机制
- `data/codes.json` 内有1000条随机生成的6位字母数字演示编码。
- 编码由随机抽样生成并打乱，不按字典序排序，不使用英文单词作为码。
- 首次载入展示117条，时间分布为：刚刚12条、5~10分钟20条、10~30分钟20条、30~60分钟20条、1~2小时15条、2~3小时15条、3~4小时15条。
- 每20秒轮换1~3条：从未展示的码池中随机抽取，淘汰时间最久的记录，形成滚动列表。
- 所有时间标签会随着真实经过时间自然变化；统计中的10分钟内新码也按时间动态计算。
- **这些1000条编码均为随机演示数据，不是真实邀请码，不代表可用性。** 正式使用前必须替换为真实采集且有来源依据的数据。
