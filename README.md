# oh-my-kimicli

External hook-first orchestration for Kimi Code CLI — 为 KimiCLI 提供技能增强、自动化工作流和使用洞察。

## 宗旨

每个人都有自己的 oh-my-kimicli。

oh-my-kimicli 的核心是 **insights** —— 它不教你该怎么工作，而是帮你看见自己实际是怎么工作的。通过分析你的 KimiCLI 会话历史，insights 识别你的工作模式、揭示你与 AI 协作时的摩擦点、发现你反复发出的指令和改进信号，最终给出只针对你一个人的、具体可操作的建议。

其余技能（ultrawork、omk-ralph、omk-review、requirements-elicitation、clarify-first）围绕这个中心展开 —— 每个人根据自己的实际使用模式，选择性地启用和调优，而不是照搬别人的配置。你的 oh-my-kimicli，由你的数据定义。

## 安装

```sh
bun install -g github:whatevertogo/oh-my-kimicli
omk setup
```

> **注意：** 本包尚未发布到 npm，`bun install -g oh-my-kimicli` 会返回 404。请使用 GitHub 地址安装。

升级后如需刷新托管的 skill 文件，运行 `omk setup --force`。普通 `omk setup` 会保留已有的 skill 目录。

CLI 入口是 TypeScript 且使用 Bun shebang，需要 Bun 在 `PATH` 上可用。

## Skills

oh-my-kimicli 安装 6 个 skill 到 KimiCLI，在对话中通过 `/skill:<name>` 调用。

### `/skill:ultrawork` — 自主高吞吐执行

复杂任务的全自动执行引擎。你描述目标，Ultrawork 自主决定执行策略并持续工作直到完成。

- 利用 omk-ralph 状态持久化实现跨轮次自动续接
- 自动拆分任务、委托子代理、集成结果
- 完成后自动运行 omk-review 作为质量门禁
- 适用于多文件改动、调试、重构、代码审查等复杂任务
- **触发词：** `ulw`、`ultrawork`、`keep going`、`finish it`、`complete this`

### `/skill:omk-ralph` — 持久化续接循环

让 KimiCLI 在当前任务完成前持续工作，不被 Stop 中断。基于项目本地的状态文件实现跨轮次持久化。

- 状态文件 `./.omk/state/ralph-state.json` 记录任务、进度和证据
- `active` 状态触发 Stop hook 自动续接，注入继续提示
- `done` 状态注入一次总结提示后允许正常停止
- `blocked` 状态在需要用户输入时暂停
- `max_iterations: -1` 表示无限续接，可设正整数限制轮次
- **触发词：** `/skill:omk-ralph <task>`、`keep going until done`

### `/skill:omk-review` — 多视角代码审查

在提交或 PR 前进行聚焦的代码审查，覆盖安全、正确性、测试和架构四个视角。

- 自动确定审查范围：用户指定 > staged diff > working-tree diff > branch diff
- **安全视角：** 检查注入、硬编码密钥、认证绕过、不安全反序列化
- **正确性视角：** 检查逻辑错误、崩溃路径、异步/null/错误处理、资源泄漏
- **测试视角：** 检查未覆盖的分支、失效的测试、无效断言
- **架构视角：** 检查跨层不一致、接口变更未传播、公共 API 变更
- 仅报告经置信度过滤的真实问题，区分新问题、已有问题和低置信度观察
- 报告输出到 `./.omk/CODE_REVIEW_ISSUES.md`
- **触发词：** `review`、`code review`、`审查`、提交前自动触发

### `/skill:insights` — 使用分析与改进建议

基于 KimiCLI 会话历史生成使用洞察报告，分析工作模式、摩擦点并提供改进建议。

- `omk insights collect` 收集会话数据，生成有界分析提示
- 当前 agent 根据提示编写叙事分析并输出结构化 JSON
- `omk insights render` 渲染为 HTML + JSON 报告
- 分析维度：工作流信号、时段分布、摩擦细节、重复指令、功能使用上下文
- 报告给出具体可操作的建议，而非仅统计汇总
- 叙事报告会输出 `skill_opportunities`，提示哪些重复工作流值得在用户确认后沉淀为 skill、hook 或 AGENTS.md 指令
- CLI 模式（`omk insights`）仅输出指标，不启动嵌套 kimi 进程
- **触发词：** `/skill:insights`、`usage insights`、`session analysis`、`friction analysis`

### `/skill:requirements-elicitation` — 执行前需求澄清

在任务目标、范围、约束或验收标准不清晰时，先澄清需求再动手，避免构建错误的东西。

- **Light 模式：** 错误成本低的任务，快速确认理解即可开始
- **Standard 模式：** 错误会导致部分返工，一批次收拢关键问题
- **Deep 模式：** 错误会浪费大量工作，分轮次深挖并输出需求文档
- 覆盖六大检查点：目标、用户/受众、必须范围、约束、非范围、完成标准
- 仅问影响结果的必要问题，可从仓库上下文推断的不问
- **触发词：** `帮我做一个X`（需求不清时）、`plan X`、`build X`、`develop X`

### `/skill:clarify-first` — 执行中决策确认

在执行过程中遇到高影响的技术决策时，先确认再行动。与 requirements-elicitation 的分工：

| requirements-elicitation | clarify-first |
|---|---|
| 执行前，目标/范围不清 | 执行中，具体实现选择不清 |
| "我们要建什么？" | "这个细节怎么处理？" |

- 仅在三种条件同时满足时才提问：有具体决策要做 + 至少两个合理选项 + 影响行为/数据/兼容性/成本/安全
- 提供推荐选项并说明理由
- 子代理不直接问用户，将歧义和推荐默认值返回给父代理
- **触发词：** 执行中遇到方案选择时、`clarify-first <decision>`

## 命令

```sh
omk setup              # 安装插件、skill 和 hooks
omk setup --force      # 强制刷新所有托管 skill
omk uninstall          # 移除托管 hooks、插件和 skill
omk config             # 创建或规范化 ~/.omk/config.json
omk doctor             # 输出机器可读的安装诊断信息
omk insights           # 生成纯指标的 KimiCLI 使用报告
omk insights collect   # 收集 /skill:insights 的有界输入
omk insights render    # 从 sections JSON 渲染叙事报告
omk insights paths     # 打印 insights 产物的文件路径
omk help               # 显示帮助
```

`omk hook` 是内部 hook 入口，由 `omk setup` 注册，不对外公开。

## 全局配置

oh-my-kimicli 从 `~/.omk/config.json` 读取用户级默认配置：

```json
{
  "version": 1,
  "features": {
    "pet": false
  }
}
```

`features.pet` 默认关闭，预留给未来的 pet 集成。测试或隔离安装时可设置 `OMK_HOME` 覆盖 `~/.omk` 目录。

## Hook 系统

`omk setup` 注册 `UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop`、`SubagentStop` 和 `StopFailure` 六个 hook 事件到 KimiCLI 的 `config.toml`。

- **UserPromptSubmit：** 为 `/skill:omk-ralph` 初始化 Ralph 状态文件
- **Stop：** 当 `./.omk/state/ralph-state.json` 处于 active 状态时阻止停止并注入续接提示
- **Plan 模式提示：** `EnterPlanMode` 提示在检测到 `plan_mode=true` 后才注入；`ExitPlanMode` 不 hook，计划审查在 plan mode 内部完成

## Plan 模式提示

可编辑的 plan 模式提示文件：

```text
prompts/plan/enter-plan-mode-next-turn.md  # plan mode 激活后注入
prompts/plan/plan-template.md              # 展开到 enter 提示中
prompts/plan/plan-mode-reentry.md          # 参考提示，默认不注入
```

HTML 注释在注入前被剥离。Enter 提示保持 KimiCLI 原生 plan mode 规范，在 `ExitPlanMode` 前添加 subagent plan-audit 门禁。

## Ralph Loop 详解

oh-my-kimicli 通过 Stop hook 和项目本地状态文件实现 Ralph 续接，不依赖 KimiCLI 原生 Ralph 模式。

**状态文件：** `./.omk/state/ralph-state.json`

```json
{
  "workflow": "ralph",
  "status": "active",
  "completion_promise": "OMK_RALPH_DONE",
  "iteration": 0,
  "max_iterations": -1,
  "evidence": []
}
```

**工作流：**
1. `/skill:omk-ralph <task>` 初始化状态为 active
2. Stop hook 检测到 active 时注入 `prompts/ralph/continue.md`，重放原始任务和当前证据
3. 任务完成时设置 status 为 `done`，hook 注入 `prompts/ralph/end.md` 生成最终摘要
4. 需要阻塞时设置 status 为 `blocked`，hook 允许正常停止

## 本地开发

从仓库根目录构建发布产物：

```sh
bun run pack:all
```

产物：
```text
dist/npm/oh-my-kimicli-0.1.0.tgz  # npm 生成的包
dist/bun/oh-my-kimicli-0.1.0.tgz  # Bun 生成的包
dist/bundle/omk.js                # Bun 构建烟雾测试产物
```

本地开发安装：

```sh
bun link
omk setup
```

本包有意发布 TypeScript 源码及 `skills/`、`prompts/`、`plugin/` 目录，因为 `omk setup` 需要这些资源来安装托管的 KimiCLI skill、提示、hook 和插件文件。

## Notes

KimiCLI 使用 `KIMI_SHARE_DIR` 存储全局数据（配置、插件、日志、会话、MCP）。用户 skill 目前从 `~/.kimi/skills` 发现，因此本安装器始终将 skill 写入该目录，即使设置了 `KIMI_SHARE_DIR`。
