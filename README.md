# oh-my-kimicli

面向 Kimi Code CLI 的外置增强包：安装 skills、hooks、提示词模板和一个 `omk` 辅助命令，让 KimiCLI 更适合长期、可复盘、可沉淀的工程协作。

oh-my-kimicli 的重点不是替代 KimiCLI，而是在 KimiCLI 原生能力外加一层可维护的个人工作流：

- 用 `/skill:insights` 从真实 session 里复盘你的使用模式
- 用 `/skill:omk-ralph` 和 hook 让任务能持续到完成或明确阻塞
- 用 `/skill:ultrawork` 把复杂任务编排成 plan、执行、验证、审查的闭环
- 用 `/skill:omk-review` 在提交前做聚焦审查
- 用 requirements / clarify skills 降低“没问清就做错”的成本

## 当前状态

- 安装方式：GitHub source install，尚未发布到 npm registry。
- 运行时：需要 Bun，`omk` 入口直接运行 TypeScript。
- KimiCLI 集成方式：写入 `~/.kimi/skills`，并在 `~/.kimi/config.toml` 中注册 hooks。
- 项目级状态：Ralph/Ultrawork 状态写入当前工作目录的 `./.omk/state/`。
- 用户级配置：`~/.omk/config.json`。

## 安装

```sh
bun install -g github:whatevertogo/oh-my-kimicli#main
omk setup
```

不要使用：

```sh
bun install -g oh-my-kimicli
```

这个包还没有发布到 npm，所以 registry 或镜像会返回 404。

安装后可以检查：

```sh
omk doctor
```

## 更新

推荐使用：

```sh
omk update
```

`omk update` 会执行一套比直接 `bun install -g` 更稳定的更新流程：

```sh
bun remove -g oh-my-kimicli
bun install -g github:whatevertogo/oh-my-kimicli#main
omk setup --force
```

`setup --force` 只处理明确带有 OMK marker 且未被用户修改的同名托管 skills，不会覆盖其它用户 skill，也不会覆盖你手改过的托管 skill。对于允许被替换的托管 skill，旧目录会先备份到：

```text
~/.kimi/skills/.omk-backups/<timestamp>/
```

为什么不只运行 `bun install -g github:whatevertogo/oh-my-kimicli`？

Bun 对 GitHub global package 有时会保留旧 commit 解析结果。你可能以为自己更新了，但 `bun pm ls -g` 仍显示旧 hash。`omk update` 通过先 remove 再 install 规避这个问题，并自动刷新已安装的 skill/hook。

Windows 上，`omk update` 默认会把更新脚本排到当前 `omk.exe` 退出后运行，避免正在运行的二进制被删除失败。日志写入：

```text
~/.omk/update.log
```

可用选项：

```sh
omk update --dry-run                 # 只显示将执行的步骤
omk update --target github:owner/repo#branch
omk update --no-setup                # 只更新全局包，不刷新 KimiCLI 安装
```

如果你当前安装的版本还没有 `omk update`，第一次仍需手动执行：

```sh
bun remove -g oh-my-kimicli
bun install -g github:whatevertogo/oh-my-kimicli#main
omk setup --force
```

## 命令

```sh
omk setup              # 安装插件、skills、prompts 和 hooks
omk setup --force      # 备份后刷新同名托管 skills
omk update             # 重新安装 GitHub main 最新版并刷新 setup
omk uninstall          # 移除托管 hooks、插件和 skills
omk config             # 创建或规范化 ~/.omk/config.json
omk doctor             # 输出机器可读的安装诊断信息
omk insights prepare   # 生成 /skill:insights 使用的 evidence pack
omk insights render    # 从 insights-content.json 渲染 HTML/JSON 报告
omk insights paths     # 打印 insights 产物路径
omk help               # 显示帮助
```

`omk hook` 是内部 hook 入口，由 `omk setup` 注册，不作为公开命令使用。

## Skills

`omk setup` 会把 6 个 skill 安装到 `~/.kimi/skills`。在 KimiCLI 中通过 `/skill:<name>` 调用。

### `/skill:insights` — 使用洞察报告

从 KimiCLI session 历史中生成个人使用洞察。它不是快速统计页，而是一条 Claude Code style 的两段式管线：

```text
/skill:insights
  -> omk insights prepare
  -> 当前 Kimi agent 阅读 evidence-pack.md
  -> 当前 Kimi agent 写 insights-content.json
  -> omk insights render
  -> 生成 report.html / report.json
```

产物目录：

```text
~/.omk/usage-data/insights/
├── evidence-pack.md
├── evidence-pack.json
├── insights-content.schema.json
├── insights-content.json
├── report.html
└── report.json
```

报告关注：

- 你常做的项目和任务类型
- 与 KimiCLI 协作时的有效模式
- 工具失败、反复纠正、任务中断等摩擦点
- 重复出现的用户偏好和指令
- 哪些工作流值得沉淀为 skill、hook 或 AGENTS.md 规则

设计边界：

- 不嵌套启动 `kimi --print`
- 不让外部 CLI 自己调用模型
- 不保留快速统计页
- 叙事内容必须来自 evidence pack 和当前 Kimi agent 的分析

### `/skill:omk-ralph` — 持久化续接循环

让 KimiCLI 在任务完成、明确阻塞或达到最大迭代前持续工作。

核心状态文件：

```text
./.omk/state/ralph-state.json
```

基本状态：

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

行为：

- `active`：Stop hook 阻止结束，并注入 `prompts/ralph/continue.md`
- `done`：Stop hook 注入一次 `prompts/ralph/end.md` 让 agent 总结，然后允许停止
- `blocked`：需要用户输入、凭据、批准或破坏性操作时允许停止

这套 Ralph 是 oh-my-kimicli 的 hook/state 实现，不依赖 KimiCLI 原生 Ralph。

### `/skill:ultrawork` — 大任务自动执行

用于多步骤、跨文件、需要验证的大任务。它会要求 agent 进入更严格的执行纪律：

- 大任务先使用 KimiCLI 原生 plan mode 形成计划
- 选择当前任务需要的 skills，而不是盲目套用全部 skill
- 必须启用 OMK Ralph 状态，避免未完成就停止
- 执行时持续记录证据
- 完成前运行合适的验证
- 收尾时使用 `omk-review` 做质量门禁

适合：

- 多文件功能实现
- 系统性修复
- 复杂 refactor
- 长代码审查
- “请你一直做完”的任务

### `/skill:omk-review` — 聚焦代码审查

生成代码审查报告：

```text
./.omk/CODE_REVIEW_ISSUES.md
```

审查范围优先级：

```text
用户指定范围 > staged diff > working-tree diff > branch diff
```

四个视角：

- Security：真实可利用的注入、密钥、权限绕过、不安全反序列化
- Code Quality：会导致错误输出、崩溃或误导维护者的问题
- Tests：变更行为缺失的测试、失效测试、无效断言
- Architecture：跨层接口不一致、类型未传播、公共 API 变更遗漏

它会尽量过滤噪声，只报告能站得住的真实问题，并区分新问题、已有问题和低置信度观察。

### `/skill:requirements-elicitation` — 执行前需求澄清

当用户的目标、范围、约束或验收标准不清晰时使用。它处理的是“做什么”。

模式：

- Light：错误成本低，快速复述确认
- Standard：一次性收拢关键问题
- Deep：多轮挖掘，输出需求文档

原则：

- 只问影响结果的问题
- 能从仓库或上下文推断的不问
- 用户说“直接做/你决定”时停止追问，基于合理假设开始

### `/skill:clarify-first` — 执行中决策确认

当执行过程中遇到高影响实现选择时使用。它处理的是“怎么做”。

触发条件：

- 有具体实现决策
- 至少两个合理方案
- 选择会影响行为、数据、兼容性、成本或安全

它会给出推荐方案和理由，而不是机械地把所有小事都丢回给用户。

## Hook 系统

`omk setup` 会向 KimiCLI 的 `config.toml` 注册这些 hook：

- `UserPromptSubmit`
- `PreToolUse`
- `PostToolUse`
- `Stop`
- `SubagentStop`
- `StopFailure`

当前主要用途：

- Ralph 状态初始化和续接
- Ultrawork/Ralph 停止门禁
- Plan mode 下一轮提示注入
- 危险 shell 命令的防御性拦截
- workflow 状态和事件日志维护

## Plan 模式提示

可编辑文件：

```text
prompts/plan/enter-plan-mode-next-turn.md
prompts/plan/plan-template.md
prompts/plan/plan-mode-reentry.md
```

当前策略：

- 保留 KimiCLI 原生 plan mode
- 只在检测到 `plan_mode=true` 后注入下一轮提示
- 不 hook `ExitPlanMode`
- 在 plan mode 内提醒 agent 用子智能体或自审方式检查 plan

## 配置

用户级配置文件：

```text
~/.omk/config.json
```

默认内容：

```json
{
  "version": 1,
  "features": {
    "pet": false
  }
}
```

`features.pet` 当前默认关闭，是未来能力的预留开关。测试或隔离运行时可用 `OMK_HOME` 改变 `~/.omk` 位置。

## 卸载

```sh
omk uninstall
```

会移除 oh-my-kimicli 托管的 hooks、plugin 和 skills。它不会删除你的 `~/.omk/usage-data`，也不会删除项目内的 `./.omk` 状态目录。

如果要移除全局 CLI：

```sh
bun remove -g oh-my-kimicli
```

## 本地开发

```sh
bun install
bun test
bun run check
bun run pack:all
```

本地链接：

```sh
bun link
omk setup --force
```

打包产物：

```text
dist/npm/oh-my-kimicli-0.1.0.tgz
dist/bun/oh-my-kimicli-0.1.0.tgz
dist/bundle/omk.js
```

本包有意发布 TypeScript 源码以及 `skills/`、`prompts/`、`plugin/` 目录，因为 `omk setup` 需要这些资源来安装 KimiCLI 托管文件。

## 路径速查

```text
~/.kimi/skills/                         # KimiCLI 用户 skills
~/.kimi/plugins/oh-my-kimicli/          # 安装后的插件目录
~/.kimi/config.toml                     # hook 注册位置
~/.omk/config.json                      # OMK 用户配置
~/.omk/usage-data/insights/             # insights 报告产物
./.omk/state/ralph-state.json           # 项目级 Ralph 状态
./.omk/CODE_REVIEW_ISSUES.md            # omk-review 报告
```

KimiCLI 当前从 `~/.kimi/skills` 发现用户 skill，因此 oh-my-kimicli 始终把托管 skill 写入该目录，即使设置了 `KIMI_SHARE_DIR`。
