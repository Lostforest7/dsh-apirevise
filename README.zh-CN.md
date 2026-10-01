# DSH API Revise

**改后端不靠猜：接口快照、回归对比、逐项验收。**

**Pre-release v0.1.0。** 已在 **DSH Web 0.2.0-rc.2**（Windows、Node 24）上验证。界面与报告为中文。真实模型闭环已于 2026-10-01 通过：基线快照 → 真实 DeepSeek V4-Flash 改后端 → 重跑 → 结构化 diff → 逐项验收 → 导出报告，**模型环节未 mock**，记录见 [docs/real-model-validation.md](docs/real-model-validation.md)。

[English](README.md) · [兼容性与限制](docs/compatibility.md)

![真实 DeepSeek 闭环：登记端点 → 快照基线 → 模型改后端 → 结构化 diff → 逐项验收 → 报告](https://raw.githubusercontent.com/Lostforest7/dsh-apirevise/main/docs/assets/real-model-demo.gif)

这段 64 秒演示使用 2026-10-01 真实运行的截图（DSH Web 0.2.0-rc.2 + 真实 DeepSeek V4-Flash），不是连续录屏。详细记录见 [docs/real-model-validation.md](docs/real-model-validation.md)。

> **解决什么痛点：** 用 DSH 改后端代码，改完不敢上线——不知道接口行为变了没有。DSH API Revise 在改之前把关键接口的响应快照下来，模型改完后一键重跑，前后响应的结构化差异（状态码 / 字段 / 数值，新旧值可追溯）与代码 diff 并排展示，你逐项验收后导出报告。

## 功能

- **手工登记端点**：URL + 方法 + 可选请求头/请求体，全部在 DSH Web 面板里填写（不做流量捕获代理，那是 v2）。
- **快照基线**：创建轮次时对每个端点发一次请求，把响应（状态码 / 头 / JSON 或文本体）保存为项目内 `.dsh-apirevise/` 文件资产，同时保存一份有上限的后端源码快照。
- **发到当前会话**：把「目标描述 + 受监控接口清单」生成请求，经 DSH 正常消息队列发到当前会话，让模型改后端代码。
- **重跑对比**：模型改完后一键重新请求全部端点，输出结构化 diff——JSON 字段级差异（新增 / 删除 / 类型 / 数值变化，带新旧值与差值）、状态码变化高亮、纯文本体给行级 patch。
- **逐项验收**：每个接口接受 / 继续修改；「继续修改」附反馈，反馈会带回下一次请求。源码在重跑后又变化时，旧对比不能用于验收，必须重新重跑；全部接口针对当前重跑版本逐项接受后才能「完成本轮验收」。
- **导出报告**：Markdown + 单文件 HTML（内嵌 diff，XSS 转义 + CSP `default-src 'none'`）。diff 只呈现事实，不宣称“接口一定没坏”；验收是人类逐项做出的决定。

## 安装

Node 使用 22.19+（22.x 线）或 24。先按 [官方文档](https://github.com/deepseek-ai/deepseek-harness) 安装配置 DSH；模型密钥由 DSH 管理，本插件没有独立 API Key。

### npm 安装

```sh
dsh plugin --profile web add dsh-apirevise
```

已发布 [`dsh-apirevise@0.1.0`](https://www.npmjs.com/package/dsh-apirevise)；[v0.1.0](https://github.com/Lostforest7/dsh-apirevise/releases/tag/v0.1.0) 另附预发布 tarball。

### 源码安装

```sh
git clone https://github.com/Lostforest7/dsh-apirevise.git
cd dsh-apirevise
npm ci
npm run build
```

停止 DSH，把仓库注册进 Web profile 后重启：

```sh
dsh plugin --profile web add /absolute/path/to/dsh-apirevise
dsh web
```

仓库自带构建好的 `lib/`，DSH 无需运行打包脚本即可加载。

## 使用

1. 本地启动后端（例如 `node server.mjs`，见 [examples/api-server](examples/api-server)，端口 3000）。
2. 在 DSH 里打开一个项目目录为该后端项目的会话，点右下角 **API 接口验收台**。
3. 新建验收轮次：标题（这轮要改什么）、目标描述（会发给会话）、受监控接口。创建即快照基线。
4. 点 **生成请求**，确认后 **发送到当前会话**，模型开始改后端。
5. 模型改完后点 **重跑对比**：查看结构化差异与代码 diff；逐个接口 **接受** 或 **继续修改**（附反馈再发会话）。
6. 全部接受后点 **完成本轮验收**，再 **导出报告**。

把 `.dsh-apirevise/` 加入项目 `.gitignore`。

## 明确不做

- 不做流量捕获代理（v2 方向）；不碰前端页面（那是 [dsh-revise](https://github.com/Lostforest7/dsh-revise) 的领地）；不做测试框架/用例运行器（那是 dsh-test-workbench 的领地）。
- 不宣称“接口一定没坏”：diff 只呈现状态码/字段/数值的旧值→新值事实。
- 验证环节不 mock 模型：真实模型闭环记录见 [docs/real-model-validation.md](docs/real-model-validation.md)。

## 开发

```sh
npm ci
npm run check        # typecheck + 单元测试 + 构建
npm run dev          # 本地预览工作台（examples/api-server），http://127.0.0.1:4320
```

单元测试全部 fixture 化、离线可跑（仅回环 HTTP），无需 DSH、无需外网：[tests/unit](tests/unit)。

## License

MIT
