---
name: godot-harness-init
description: Initialize a Godot 4.x project for the Claude Code + godot-mcp AI Harness workflow. Use this skill when the user wants to set up a new Godot project to work with MCP tools, or says things like "初始化 Godot 工程", "setup godot harness", "配置 godot-mcp", "set up AI harness for Godot", "initialize godot project for Claude", or starts a new Godot AI project from scratch. Covers environment check, godot-mcp install, .mcp.json config, autoload setup, project file structure (CLAUDE.md / AGENTS.md / progress.md), and MCP connection verification. Use this skill proactively whenever a Godot project directory lacks .mcp.json or CLAUDE.md.
---

# Godot AI Harness 初始化

完整初始化一个 Godot 4.x 项目目录，使其可以通过 Claude Code + godot-mcp 进行 AI 辅助开发。

按以下 Phase 顺序执行。部分步骤需要用户在 Godot 编辑器中手动操作，遇到时明确提示并等待确认再继续。

---

## Phase 1：环境检查

```bash
# 检查 Godot
/Applications/Godot.app/Contents/MacOS/Godot --version

# 检查 Node.js
node --version

# 检查 godot-mcp 是否已 build
ls ../godot-mcp/build/index.js 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

记录版本信息，后续写入 docs/setup/mcp-setup.md。

---

## Phase 2：godot-mcp 安装

如果 Phase 1 中 `build/index.js` 不存在，执行安装：

```bash
cd ..
git clone https://github.com/tugcantopaloglu/godot-mcp.git
cd godot-mcp
npm install
npm run build
# 期望输出：Successfully copied scripts to build/scripts
```

> **目录约定：** godot-mcp 必须 clone 到项目目录的**上级平级目录**（`../godot-mcp/`）。这样 `.mcp.json` 可以使用相对路径，整个配置可以提交到 git 并被团队共享，无需每个人配置绝对路径。

> **注意：** godot-mcp 未发布到 npm（`tugcantopaloglu-godot-mcp` 包不存在），必须从 GitHub clone + 本地 build，不能用 `npx`。

---

## Phase 3：MCP 配置

在项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["../godot-mcp/build/index.js"],
      "env": {
        "DEBUG": "true"
      }
    }
  }
}
```

> **关键：** MCP 服务器配置只能放在 `.mcp.json`，**不能**放在 `.claude/settings.json` 或 `.claude/settings.local.json`。Claude Code 的 settings schema 不包含 `mcpServers` 字段，写入会被 schema 验证拒绝。

> `GODOT_PATH` 在 macOS 上可省略，godot-mcp 会自动检测 `/Applications/Godot.app`。

**提示用户重启 Claude Code**，`.mcp.json` 需要在启动时加载才能生效。

---

## Phase 4：Autoload 安装

将 interaction server 脚本复制到 Godot 项目：

```bash
mkdir -p addons/mcp_interaction_server
cp ../godot-mcp/build/scripts/mcp_interaction_server.gd addons/mcp_interaction_server/
```

然后**提示用户**在 Godot 编辑器中手动注册（此步骤无法自动化）：

> 请在 Godot 编辑器中完成以下操作：
> **Project → Project Settings → Globals → Autoload**
> - Path: `res://addons/mcp_interaction_server/mcp_interaction_server.gd`
> - Name: `McpInteractionServer`
> 点击 Add，确认列表中出现该条目后告诉我。

> **注意：** Godot 4 中 Autoload 在 Project Settings 左侧的 **Globals** 分类下，不在 General tab 里。

等待用户确认后再继续。

---

## Phase 5：工程文件结构

创建 AI Harness 工作流所需的文件：

**CLAUDE.md**（Claude 自动加载的项目入口）：
```markdown
# Project Memory

See @AGENTS.md for shared cross-tool rules.
See @docs/README.md for document navigation.
See @progress.md for current milestone, blockers, and next step.

## Claude-specific working defaults

- Use Godot 4.6.x APIs.
- Prefer GDScript for gameplay and scene logic.
- Godot project root: `.` (project.godot is at workspace root)
- Before editing a scene, inspect current state through MCP.
- After meaningful progress, update progress.md.
```

**AGENTS.md**（跨工具共享规范）：
```markdown
# Project Rules

## Stack
- Engine: Godot 4.6.x stable
- Default language: GDScript
- MCP: tugcantopaloglu/godot-mcp (149 tools), TCP Socket 9090

## Naming
- Filenames: snake_case / Node names: PascalCase
- Signals: snake_case / Private members: _prefix

## Validation Loop
- Scene changes: inspect → modify → game_get_errors → screenshot
- Logic changes: game_eval 验证行为
- Important decisions: record in docs/design/architecture.md

## Session Close
- Update progress.md with done / doing / next / blockers
```

**progress.md** 和 **docs/README.md**：创建最小 stub，后续随项目补充。

**.gitignore** 补充：
```
.godot/
.DS_Store
.claude/settings.local.json
```

---

## Phase 6：MCP 连接验证

**Headless 工具验证**（不需要运行游戏）：
```
get_godot_version    → 应返回 4.x.x.stable...
get_project_info     → 应返回项目名称和文件结构
```

**Runtime 工具验证**（需要通过 MCP 启动游戏）：
```
run_project → game_wait(60 frames) → game_get_errors → game_screenshot
```

在 debug 输出中查找 `McpInteractionServer: Listening on 127.0.0.1:9090`，确认 autoload 正常运行。

> **关键：** 必须通过 `run_project` 启动游戏，MCP 才能追踪进程。在 Godot 编辑器里手动运行（Command+B / F5）的游戏，MCP 无法连接，调用 `game_screenshot`、`game_eval` 等会报 `No active Godot process`。

---

## Phase 7：初始场景

如果项目没有主场景，创建一个：

```
create_scene(scenePath="scenes/main.tscn", rootNodeType="Node2D")
set_main_scene(scenePath="scenes/main.tscn")
```

停止游戏（如果在运行），再通过 `run_project` 确认项目能正常启动、无错误。

---

## Phase 8：初始提交

```bash
git add .mcp.json CLAUDE.md AGENTS.md progress.md .gitignore \
        project.godot addons/ docs/ scenes/
git commit -m "init: Godot AI Harness setup"
```

---

## 已知坑点速查

| 坑点 | 现象 | 解法 |
|---|---|---|
| 游戏运行时做 headless 场景编辑 | port 9090 冲突，`add_node` 等报错 | 先 `stop_project`，编辑完再 `run_project` |
| `add_node` 的 position 不生效 | 节点落在 (0,0) | 在 `_ready()` 脚本或 `game_eval` 中设置位置 |
| `PhysicsMaterial2D` 不存在 | GDScript parse error | Godot 4 统一用 `PhysicsMaterial` |
| `mcpServers` 写入 settings 文件 | schema 验证报错 | 只能用 `.mcp.json` |
| 手动运行游戏后调用 runtime tools | `No active Godot process` | 用 MCP 的 `run_project` 启动 |
| Autoload 找不到注册入口 | 在 General tab 里找不到 | 在左侧 **Globals** 分类 → Autoload tab |
