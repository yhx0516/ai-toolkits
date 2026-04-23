---
name: sofunny-image
description: 使用 New-API 按模型前缀自动调用 Gemini 原生接口或 OpenAI Images API 生成/编辑图片。适用于需要文本生图、参考图编辑、输出本地 PNG，并希望复用 `.sofunny-image.env` 或当前 shell 环境变量的场景。
---

# sofunny-image

## 何时使用

在以下场景使用本 skill：

- 用户要生成图片，而当前客户端主模型并不适合直接承担图片输出
- 用户要上传一张或多张参考图，再结合文本生成新图片
- 用户要通过 `New-API` 出图，并按模型前缀自动选择 Gemini 原生接口或 OpenAI Images API
- 用户希望优先复用：
  - 进程环境变量
  - `~/.sofunny-image.env`

如果只是普通文本问答、代码生成或工具调用，不要使用本 skill。

## 配置来源

脚本按以下顺序读取配置：

1. `~/.sofunny-image.env`
2. 当前 shell 的环境变量

命令行参数 `--base-url`、`--api-key`、`--model` 会覆盖以上配置。

如果没有检测到 `~/.sofunny-image.env`，脚本会提示你创建该文件并写入所需变量模板。

优先使用这些变量：

- `SOFUNNY_BASE_URL`
- `SOFUNNY_API_KEY`
- `SOFUNNY_MODEL`

默认期望值：

- `SOFUNNY_BASE_URL=http://127.0.0.1:3000`
- `SOFUNNY_MODEL=gemini-3.1-flash-image-preview`

## 安装与执行入口

- 推荐将仓库目录软链接到：
  - `${CLAUDE_PLUGIN_ROOT}/skills/sofunny-image`
- 可执行脚本入口：
  - `${CLAUDE_PLUGIN_ROOT}/skills/sofunny-image/scripts/sofunny-image.js`

## 快速用法

文本生图：

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/sofunny-image/scripts/sofunny-image.js \
  --prompt "生成一张 16:9 的极简香蕉海报，不要任何文字。"
```

参考图编辑：

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/sofunny-image/scripts/sofunny-image.js \
  --prompt "保持主体不变，把背景改成晨雾中的山谷。" \
  --input /absolute/path/to/ref-1.png \
  --input /absolute/path/to/ref-2.jpg
```

指定输出、比例和分辨率：

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/sofunny-image/scripts/sofunny-image.js \
  --prompt "生成一张赛博朋克风格香蕉图标。" \
  --aspect-ratio 1:1 \
  --image-size 2K \
  --output /tmp/banana-icon.png
```

使用 `gpt-image-2` 文生图：

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/sofunny-image/scripts/sofunny-image.js \
  --model gpt-image-2 \
  --prompt "生成一张极简风格的蓝色机械鸟海报，不要文字。" \
  --quality auto
```

使用 `gpt-image-2` 图生图：

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/sofunny-image/scripts/sofunny-image.js \
  --model gpt-image-2 \
  --prompt "保留主体轮廓，把材质改成磨砂陶瓷。" \
  --input /absolute/path/to/ref-1.png
```

## 参数说明

- `--prompt`：必填，图片生成或编辑指令
- `--input`：可重复传入，一张或多张参考图
- `--output`：可选，输出文件路径
- `--size`：可选，OpenAI 图片尺寸；支持 `1024x1024`、`1024x1536`、`1536x1024`、`auto`；未传时不发送该字段，由上游使用默认 `auto`
- `--quality`：可选，OpenAI 图片质量；支持 `low`、`medium`、`high`、`auto`；默认 `auto`
- `--background`：可选，OpenAI 背景参数；支持 `transparent`、`opaque`、`auto`
- `--output-format`：可选，OpenAI 输出格式；支持 `png`、`webp`、`jpeg`；默认 `png`
- `--output-compression`：可选，OpenAI 输出压缩率，默认 `100`
- `--aspect-ratio`：可选，默认 `16:9`
- `--image-size`：可选，默认 `1K`
- `--model`：可选，默认读取配置，兜底为 `gemini-3.1-flash-image-preview`；`gemini-*` 走 Gemini 原生接口，`gpt-image-*` 走 OpenAI Images API
- `--base-url`：可选，覆盖配置中的 base URL
- `--api-key`：可选，覆盖配置中的 token

## 工作流

1. 收集用户的 prompt、参考图、输出路径和画幅要求。
2. 运行 `scripts/sofunny-image.js`。
3. 脚本会按模型前缀自动分流：
   - `gemini-*`：调用 `{BASE_URL}/v1beta/models/{MODEL}:generateContent`
   - `gpt-image-*` 且无 `--input`：调用 `{BASE_URL}/v1/images/generations`
   - `gpt-image-*` 且有 `--input`：调用 `{BASE_URL}/v1/images/edits`
4. Gemini 响应提取最后一个 `inlineData.data`；OpenAI Images 响应提取最后一个 `data[].b64_json`，并视为最终图片保存到本地。
5. 把保存路径返回给用户。

## 注意事项

- 本 skill 默认不附带 `tools` 和 `thinking`，避免图片模型在工具模式下失败。
- `BASE_URL` 应为服务根地址；脚本会自动拼出 `/v1beta/...` 或 `/v1/images/...`，不要手动把环境变量写成特定接口路径。
- 若未指定输出路径，脚本默认保存到：
  - 当前工作目录
- `~/.sofunny-image.env` 中只应使用 `SOFUNNY_*` 变量，避免旧配置混入导致行为不一致。
- 如果 Gemini 或 OpenAI Images 在同一次响应中返回多张图片，脚本默认只保存最后一张，前面的图片视为中间产物。
- 当前 `gpt-image-*` 先不支持 `mask`；若用户传入 `--input`，默认按普通图生图/编辑处理。
- `gpt-image-*` 若未传 `--size`，脚本不会显式发送 `size`，交由上游按默认 `auto` 处理。
- `gpt-image-*` 当前建议优先显式使用：
  - `quality=auto`
  - `output_format=png`
  - `background=auto` 或按需指定 `transparent` / `opaque`
