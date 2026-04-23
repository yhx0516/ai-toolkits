#!/usr/bin/env node

// 通过 New-API 的 Gemini 原生接口或 OpenAI Images API 生成/编辑图片。
// 配置优先级：命令行参数 > 进程环境变量 > ~/.sofunny-image.env。

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const HOME = os.homedir();
const SOFUNNY_ENV_PATH = path.join(HOME, ".sofunny-image.env");

function printHelp() {
  console.log(`sofunny-image

使用：
  node scripts/sofunny-image.js --prompt "生成一张 16:9 的极简香蕉海报"

参数：
  --prompt         必填，图片生成或编辑指令
  --input          可重复传入，一张或多张参考图
  --output         输出文件路径
  --size           OpenAI 图片尺寸；未传时交由上游使用默认 auto
  --quality        OpenAI 图片质量，默认 auto
  --background     OpenAI 背景参数
  --output-format  OpenAI 输出格式，默认 png
  --output-compression OpenAI 输出压缩率，默认 100
  --aspect-ratio   图片比例，默认 16:9
  --image-size     图片分辨率，默认 1K
  --model          覆盖模型
  --base-url       覆盖服务根地址
  --api-key        覆盖 New-API 令牌
  --help           显示帮助
`);
}

function parseArgs(argv) {
  const result = {
    input: [],
    quality: "auto",
    outputFormat: "png",
    outputCompression: "100",
    aspectRatio: "16:9",
    imageSize: "1K",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--prompt":
        result.prompt = argv[++i];
        break;
      case "--input":
        result.input.push(argv[++i]);
        break;
      case "--output":
        result.output = argv[++i];
        break;
      case "--size":
        result.size = argv[++i];
        break;
      case "--quality":
        result.quality = argv[++i];
        break;
      case "--background":
        result.background = argv[++i];
        break;
      case "--output-format":
        result.outputFormat = argv[++i];
        break;
      case "--output-compression":
        result.outputCompression = argv[++i];
        break;
      case "--aspect-ratio":
        result.aspectRatio = argv[++i];
        break;
      case "--image-size":
        result.imageSize = argv[++i];
        break;
      case "--model":
        result.model = argv[++i];
        break;
      case "--base-url":
        result.baseUrl = argv[++i];
        break;
      case "--api-key":
        result.apiKey = argv[++i];
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
      default:
        throw new Error(`不支持的参数：${arg}`);
    }
  }

  return result;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const index = line.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }

  return env;
}

function normalizeBaseUrl(rawBaseUrl) {
  if (!rawBaseUrl) {
    return "";
  }

  let baseUrl = rawBaseUrl.trim().replace(/\/+$/, "");
  if (baseUrl.endsWith("/v1")) {
    baseUrl = baseUrl.slice(0, -3);
  }
  return baseUrl;
}

function applyConfigOverlay(target, source) {
  if (!source) {
    return;
  }

  if (source.SOFUNNY_BASE_URL) {
    target.baseUrl = source.SOFUNNY_BASE_URL;
  }
  if (source.SOFUNNY_API_KEY) {
    target.apiKey = source.SOFUNNY_API_KEY;
  }
  if (source.SOFUNNY_MODEL) {
    target.model = source.SOFUNNY_MODEL;
  }
}

function resolveConfig(cliArgs) {
  const envFileExists = fs.existsSync(SOFUNNY_ENV_PATH);
  const fileEnv = parseEnvFile(SOFUNNY_ENV_PATH);
  const merged = {
    baseUrl: "http://127.0.0.1:3000",
    apiKey: "",
    model: "gemini-3.1-flash-image-preview",
  };

  // 先读 env 文件，再让当前进程环境变量覆盖，保证外部调用能显式接管配置。
  applyConfigOverlay(merged, fileEnv);
  applyConfigOverlay(merged, process.env);

  if (cliArgs.baseUrl) {
    merged.baseUrl = cliArgs.baseUrl;
  }
  if (cliArgs.apiKey) {
    merged.apiKey = cliArgs.apiKey;
  }
  if (cliArgs.model) {
    merged.model = cliArgs.model;
  }

  return {
    baseUrl: normalizeBaseUrl(merged.baseUrl),
    apiKey: merged.apiKey,
    model: merged.model,
    envFileExists,
  };
}

function buildEnvFileHint() {
  return [
    `未检测到 ${SOFUNNY_ENV_PATH}。`,
    "请先创建该文件，并写入以下变量：",
    "SOFUNNY_BASE_URL=http://127.0.0.1:3000",
    "SOFUNNY_API_KEY=你的 New-API 用户令牌",
    "SOFUNNY_MODEL=gemini-3.1-flash-image-preview",
  ].join("\n");
}

function detectMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

function getModelFamily(model) {
  if (typeof model !== "string" || model.trim() === "") {
    return "unknown";
  }
  if (model.startsWith("gemini-")) {
    return "gemini";
  }
  if (model.startsWith("gpt-image-")) {
    return "openai-images";
  }
  return "unknown";
}

function buildParts(prompt, inputFiles) {
  const parts = [{ text: prompt }];

  for (const inputFile of inputFiles) {
    const absolutePath = path.resolve(inputFile);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`输入图片不存在：${absolutePath}`);
    }

    const data = fs.readFileSync(absolutePath).toString("base64");
    parts.push({
      inlineData: {
        mimeType: detectMimeType(absolutePath),
        data,
      },
    });
  }

  return parts;
}

function ensureOutputDir(outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
}

function defaultOutputPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  // 未指定输出路径时，默认把图片写到当前工作目录，便于在调用方当前项目中直接查看产物。
  return path.join(process.cwd(), `sofunny-image-${stamp}.png`);
}

function buildOutputPath(requestedOutput) {
  return requestedOutput ? path.resolve(requestedOutput) : defaultOutputPath();
}

function buildOpenAIImagesBody(cliArgs, model) {
  const body = {
    model,
    prompt: cliArgs.prompt,
    quality: cliArgs.quality,
    output_format: cliArgs.outputFormat,
    output_compression: Number.parseInt(cliArgs.outputCompression, 10),
  };

  if (cliArgs.size) {
    body.size = cliArgs.size;
  }

  if (Number.isNaN(body.output_compression)) {
    throw new Error("--output-compression 必须是整数");
  }

  if (cliArgs.background) {
    body.background = cliArgs.background;
  }

  return body;
}

async function requestGeminiImage(config, cliArgs) {
  const requestBody = {
    contents: [
      {
        role: "user",
        parts: buildParts(cliArgs.prompt, cliArgs.input),
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: cliArgs.aspectRatio,
        imageSize: cliArgs.imageSize,
      },
    },
  };

  const endpoint = `${config.baseUrl}/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `请求失败，状态码 ${response.status}`;
    throw new Error(message);
  }

  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const imageParts = parts.filter((part) => part?.inlineData?.data);

  if (imageParts.length === 0) {
    const textParts = parts.filter((part) => part?.text).map((part) => part.text).join("\n");
    throw new Error(textParts || "响应里没有找到图片数据。");
  }

  const finalImagePart = imageParts[imageParts.length - 1];
  return {
    imageBase64: finalImagePart.inlineData.data,
    returnedImageCount: imageParts.length,
    text: parts.filter((part) => part?.text).map((part) => part.text).join("\n").trim(),
    endpoint,
  };
}

async function requestOpenAIImageGeneration(config, cliArgs) {
  const endpoint = `${config.baseUrl}/v1/images/generations`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildOpenAIImagesBody(cliArgs, config.model)),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `请求失败，状态码 ${response.status}`;
    throw new Error(message);
  }

  const imageDataList = Array.isArray(payload?.data) ? payload.data.filter((item) => item?.b64_json) : [];
  if (imageDataList.length === 0) {
    throw new Error("响应里没有找到 b64_json 图片数据。");
  }

  return {
    imageBase64: imageDataList[imageDataList.length - 1].b64_json,
    returnedImageCount: imageDataList.length,
    revisedPrompt: imageDataList[imageDataList.length - 1].revised_prompt || "",
    endpoint,
  };
}

async function requestOpenAIImageEdit(config, cliArgs) {
  const endpoint = `${config.baseUrl}/v1/images/edits`;
  const form = new FormData();
  form.set("model", config.model);
  form.set("prompt", cliArgs.prompt);
  form.set("quality", cliArgs.quality);
  form.set("output_format", cliArgs.outputFormat);
  form.set("output_compression", cliArgs.outputCompression);

  if (cliArgs.size) {
    form.set("size", cliArgs.size);
  }

  if (cliArgs.background) {
    form.set("background", cliArgs.background);
  }

  for (const inputFile of cliArgs.input) {
    const absolutePath = path.resolve(inputFile);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`输入图片不存在：${absolutePath}`);
    }
    const buffer = fs.readFileSync(absolutePath);
    const blob = new Blob([buffer], { type: detectMimeType(absolutePath) });
    form.append("image[]", blob, path.basename(absolutePath));
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `请求失败，状态码 ${response.status}`;
    throw new Error(message);
  }

  const imageDataList = Array.isArray(payload?.data) ? payload.data.filter((item) => item?.b64_json) : [];
  if (imageDataList.length === 0) {
    throw new Error("响应里没有找到 b64_json 图片数据。");
  }

  return {
    imageBase64: imageDataList[imageDataList.length - 1].b64_json,
    returnedImageCount: imageDataList.length,
    revisedPrompt: imageDataList[imageDataList.length - 1].revised_prompt || "",
    endpoint,
  };
}

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));
  if (cliArgs.help) {
    printHelp();
    return;
  }

  if (!cliArgs.prompt) {
    throw new Error("缺少 --prompt");
  }

  const config = resolveConfig(cliArgs);
  const modelFamily = getModelFamily(config.model);
  if (modelFamily === "unknown") {
    throw new Error(`当前只支持 gemini-* 或 gpt-image-* 模型，收到：${config.model}`);
  }

  if (!config.apiKey) {
    if (!config.envFileExists && !process.env.SOFUNNY_API_KEY && !cliArgs.apiKey) {
      throw new Error(buildEnvFileHint());
    }
    throw new Error(
      "未找到 SOFUNNY_API_KEY，请通过环境变量、~/.sofunny-image.env 或 --api-key 提供。",
    );
  }

  let result;
  if (modelFamily === "gemini") {
    result = await requestGeminiImage(config, cliArgs);
  } else if (cliArgs.input.length > 0) {
    result = await requestOpenAIImageEdit(config, cliArgs);
  } else {
    result = await requestOpenAIImageGeneration(config, cliArgs);
  }

  const outputPath = buildOutputPath(cliArgs.output);
  ensureOutputDir(outputPath);

  const buffer = Buffer.from(result.imageBase64, "base64");
  fs.writeFileSync(outputPath, buffer);

  const summary = {
    model: config.model,
    base_url: config.baseUrl,
    endpoint: result.endpoint,
    returned_image_count: result.returnedImageCount,
    saved_image_count: 1,
    outputs: [outputPath],
  };

  if (result.text) {
    summary.text = result.text;
  }
  if (result.revisedPrompt) {
    summary.revised_prompt = result.revisedPrompt;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
