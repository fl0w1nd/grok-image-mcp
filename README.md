# Grok Image MCP

[English](#english) | [中文](#中文)

<a id="english"></a>

An MCP server for generating and editing images with the [xAI image API](https://docs.x.ai/developers/model-capabilities/images/generation). Select a model and quality, edit local or stored images, and receive image links or inline images. Runs over stdio.

Requires **Node.js 22.19+** and an xAI API key. Node 24 LTS is recommended for new installations.

> Previously published as `grok2-image-mcp-server`; use `grok-image-mcp`.

## Quick start

Add this to your MCP client's configuration:

```json
{
  "mcpServers": {
    "grok_image": {
      "command": "npx",
      "args": ["-y", "grok-image-mcp"],
      "env": {
        "XAI_API_KEY": "your-xai-api-key"
      }
    }
  }
}
```

Ask your client to generate an image or edit an existing one. The server exposes `generate_image` and `edit_image`.

Example `generate_image` arguments with quality control:

```json
{
  "prompt": "A watercolor illustration of a quiet mountain lake",
  "model": "grok-imagine-image-2.0",
  "quality": "low",
  "aspect_ratio": "16:9"
}
```

## Models and quality

| Capability | `grok-imagine-image` | `grok-imagine-image-2.0` |
|---|---|---|
| Default model | Yes | Select per call or set `XAI_IMAGE_MODEL` |
| Source images per edit | 1–3 | 1–5 |
| Resolution | `1k`, `2k` | `1k`, `2k` |
| Quality parameter | Not supported | `low`, `medium`, `auto` |
| Additional aspect ratios | — | `21:9`, `5:2` |

The default remains `grok-imagine-image`. The `model` argument overrides `XAI_IMAGE_MODEL`.

On 2.0, omitted quality defaults to `auto`: currently `low` for generation and `medium` for editing. Set quality explicitly for consistent cost and behavior. Image edits are also charged for input images; see [xAI pricing](https://docs.x.ai/developers/pricing). The server does not automatically retry paid requests.

## Tools

Both tools accept these parameters:

| Parameter | Type | Description |
|---|---|---|
| `prompt` | string, required | Image description or editing instructions; cannot be empty |
| `model` | string | One of the two models above |
| `n` | integer | Output count, 1–10; default 1 |
| `aspect_ratio` | string | Generation defaults to `auto`; editing follows the first input |
| `resolution` | string | `1k` or `2k`; default `1k` |
| `quality` | string | 2.0 only: `low`, `medium`, `auto` |
| `response_format` | string | `url` (default) or `b64_json` for inline MCP image content |
| `storage_options` | object | Save generated images to the Files API; see below |

Aspect ratios: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `2:1`, `1:2`, `19.5:9`, `9:19.5`, `20:9`, `9:20`, `auto`; 2.0 additionally supports `21:9` and `5:2`.

### Editing

`edit_image` also requires **exactly one** source list:

- `image_urls`: ordered array of public URLs, base64 data URIs, or local paths.
- `images`: ordered array of `{ "url": "..." }` or `{ "file_id": "..." }` objects. `url` also accepts data URIs and local paths. Use this form to mix stored files with other sources.

```json
{
  "prompt": "Replace the background with a snowy forest",
  "image_urls": ["/absolute/path/to/photo.png"]
}
```

Local files support PNG, JPEG and WebP and must be accessible to the server process. Relative paths resolve from the server's working directory; absolute paths are recommended. Local image bytes are sent to xAI for editing.

### Results

Successful calls return `structuredContent.images` and an `outputSchema`, plus text content for clients that do not consume structured results. Image entries include available URLs, revised prompts, MIME types and stored-file metadata. Model, quality and usage are included when supplied by xAI.

The default URL mode also returns Markdown image links. These URLs are temporary: download promptly or use storage. With `response_format: "b64_json"`, image bytes are returned in MCP `image` content blocks; the corresponding structured entry has `inline: true`. Image bytes are not duplicated in the JSON result. Rendering depends on the MCP client.

## Save images and reuse them

Add `storage_options` to either tool to persist output in the xAI Files API:

```json
{
  "prompt": "A small cabin in a pine forest",
  "model": "grok-imagine-image-2.0",
  "quality": "low",
  "storage_options": {
    "filename": "cabin.jpg",
    "expires_after": 86400
  }
}
```

This stores the output **privately** for one day. Retrieve `structuredContent.images[0].file_output.file_id` and reuse it in an edit:

```json
{
  "prompt": "Change the season to winter",
  "model": "grok-imagine-image-2.0",
  "quality": "low",
  "images": [{ "file_id": "file-id-from-the-previous-result" }]
}
```

| Storage option | Description |
|---|---|
| `filename` | Required filename for the stored image |
| `expires_after` | Optional lifetime in seconds, 3600–2592000; omitted means permanent storage |
| `public_url` | Omitted or `false` keeps storage private; `true` creates a shareable public link |
| `public_url.expires_after` | Use `public_url: { "expires_after": 86400 }` to set a link lifetime |

A public URL cannot outlive its stored file. A failed public-link creation may still leave a successfully stored image; inspect `file_output.public_url_error`. See [xAI storage documentation](https://docs.x.ai/developers/model-capabilities/imagine/files/outputs).

## Configuration and networking

| Environment variable | Description |
|---|---|
| `XAI_API_KEY` | xAI API key; takes precedence over `XAIAPI_KEY` |
| `XAIAPI_KEY` | Existing API-key variable, still supported |
| `XAI_IMAGE_MODEL` | Default model; `grok-imagine-image` when omitted |
| `XAIAPI_BASE_URL` | API base URL; default `https://api.x.ai/v1` |
| `XAI_TIMEOUT_MS` | Positive integer request timeout in milliseconds; default `180000` |
| `HTTPS_PROXY` | Network proxy for API requests; takes precedence over `HTTP_PROXY` |
| `HTTP_PROXY` | Network proxy, e.g. `http://127.0.0.1:7890` |
| `IMAGE_PROXY_DOMAIN` | Your reverse proxy for returned `imgen.x.ai` URLs, e.g. `https://images.example.com` |

`IMAGE_PROXY_DOMAIN` rewrites image links only; it does not proxy API traffic or make images permanent. Configure the reverse proxy to forward paths and query strings to `https://imgen.x.ai`. Files API public URLs are left unchanged.

The timeout covers both the request and response body. Configure the MCP client's tool timeout to at least the server timeout for slow generations. Client cancellation aborts the outgoing request, but an interrupted request may still complete and be billed upstream. This server currently uses synchronous image endpoints.

## Development

```bash
npm ci
npm test
```

`npm test` builds the server and runs stdio integration tests against a local API fixture. It requires no API key and makes no paid requests. CI checks Node 22 and 24; releases run these checks before publishing with Node 24.

To run the checked-out version from an MCP client after building, use `node` with the absolute path to `dist/index.js` instead of `npx`. With nvm, select a supported Node version in the current shell (`nvm use 22` or `nvm use 24`); no default-alias change is needed. GUI clients may require an absolute Node executable path.

## License

MIT

---

<a id="中文"></a>

基于 [xAI 图像 API](https://docs.x.ai/developers/model-capabilities/images/generation) 的 MCP 服务，支持选择模型与质量、编辑本地图片或已存储的图片，并返回图片链接或内联图片。使用 stdio 传输。

需要 **Node.js 22.19+** 和 xAI API 密钥；新环境推荐 Node 24 LTS。

> 原包名为 `grok2-image-mcp-server`，请使用 `grok-image-mcp`。

## 快速开始

在 MCP 客户端中添加：

```json
{
  "mcpServers": {
    "grok_image": {
      "command": "npx",
      "args": ["-y", "grok-image-mcp"],
      "env": {
        "XAI_API_KEY": "你的 xAI API 密钥"
      }
    }
  }
}
```

随后让客户端生成或编辑图片。服务提供 `generate_image` 和 `edit_image` 两个工具。

指定模型与质量的 `generate_image` 调用示例：

```json
{
  "prompt": "一幅宁静山间湖泊的水彩插画",
  "model": "grok-imagine-image-2.0",
  "quality": "low",
  "aspect_ratio": "16:9"
}
```

## 模型与质量

| 能力 | `grok-imagine-image` | `grok-imagine-image-2.0` |
|---|---|---|
| 默认模型 | 是 | 每次调用指定，或设置 `XAI_IMAGE_MODEL` |
| 编辑源图数量 | 1–3 张 | 1–5 张 |
| 分辨率 | `1k`、`2k` | `1k`、`2k` |
| 质量参数 | 不支持 | `low`、`medium`、`auto` |
| 新增宽高比 | — | `21:9`、`5:2` |

默认保持 `grok-imagine-image`；调用时的 `model` 优先于环境变量 `XAI_IMAGE_MODEL`。

2.0 未指定质量时使用 `auto`，目前生成对应 `low`，编辑对应 `medium`。需要固定费用档位与行为时，请明确指定质量。编辑还会对输入图片计费，详情见 [xAI 定价](https://docs.x.ai/developers/pricing)。服务不会自动重试付费请求。

## 工具参数

两个工具共用以下参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `prompt` | string，必填 | 图片描述或编辑指令，不可为空 |
| `model` | string | 上表中的模型之一 |
| `n` | integer | 输出数量，1–10，默认 1 |
| `aspect_ratio` | string | 生成默认 `auto`；编辑默认跟随第一张源图 |
| `resolution` | string | `1k` 或 `2k`，默认 `1k` |
| `quality` | string | 仅 2.0 支持：`low`、`medium`、`auto` |
| `response_format` | string | 默认 `url`；`b64_json` 返回 MCP 原生图片内容 |
| `storage_options` | object | 将输出保存至 Files API，见下文 |

宽高比支持 `1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`、`2:1`、`1:2`、`19.5:9`、`9:19.5`、`20:9`、`9:20`、`auto`；2.0 还支持 `21:9`、`5:2`。

### 编辑图片

`edit_image` 还必须提供以下两种源图列表中的**一种**：

- `image_urls`：按顺序提供公开 URL、base64 data URI 或本地路径。
- `images`：按顺序提供 `{ "url": "..." }` 或 `{ "file_id": "..." }` 对象。`url` 也接受 data URI 和本地路径，适合混合使用存储文件与其他来源。

```json
{
  "prompt": "将背景替换成雪中的森林",
  "image_urls": ["/absolute/path/to/photo.png"]
}
```

本地文件支持 PNG、JPEG、WebP，必须能被服务进程读取。相对路径以服务的工作目录为基准，建议使用绝对路径。本地图片内容会发送至 xAI 进行编辑。

### 返回结果

成功结果提供 `structuredContent.images` 和 `outputSchema`，同时保留文本结果。图片条目包含接口实际返回的 URL、修改后的提示词、MIME 类型和文件存储信息；模型、质量、用量信息仅在 xAI 返回时提供。

默认 URL 模式还会返回 Markdown 图片链接。链接是临时的，请及时下载或使用存储功能。`response_format: "b64_json"` 将图片字节放入 MCP `image` 内容块，对应结构化条目带有 `inline: true`，不会在 JSON 中重复图片字节。图片展示效果取决于 MCP 客户端。

## 保存与复用图片

为任一工具添加 `storage_options`，即可保存输出：

```json
{
  "prompt": "松林中的一间小木屋",
  "model": "grok-imagine-image-2.0",
  "quality": "low",
  "storage_options": {
    "filename": "cabin.jpg",
    "expires_after": 86400
  }
}
```

上述配置将图片**私有保存一天**。从 `structuredContent.images[0].file_output.file_id` 取得文件 ID，随后编辑时复用：

```json
{
  "prompt": "将季节改成冬季",
  "model": "grok-imagine-image-2.0",
  "quality": "low",
  "images": [{ "file_id": "上一次返回的文件 ID" }]
}
```

| 存储选项 | 说明 |
|---|---|
| `filename` | 必填，存储文件名 |
| `expires_after` | 可选，3600–2592000 秒；省略则永久保存 |
| `public_url` | 省略或 `false` 为私有存储；设为 `true` 创建公开分享链接 |
| `public_url.expires_after` | 使用 `public_url: { "expires_after": 86400 }` 指定公开链接有效期 |

公开链接不能比文件保存更久。公开链接创建失败时，文件可能仍已保存，请检查 `file_output.public_url_error`。详见 [xAI 存储文档](https://docs.x.ai/developers/model-capabilities/imagine/files/outputs)。

## 环境变量与网络

| 变量 | 说明 |
|---|---|
| `XAI_API_KEY` | API 密钥，优先于 `XAIAPI_KEY` |
| `XAIAPI_KEY` | 原有密钥变量，仍然支持 |
| `XAI_IMAGE_MODEL` | 默认模型，未设置时为 `grok-imagine-image` |
| `XAIAPI_BASE_URL` | API 基础地址，默认 `https://api.x.ai/v1` |
| `XAI_TIMEOUT_MS` | 请求超时毫秒数，正整数，默认 `180000` |
| `HTTPS_PROXY` | API 网络代理，优先于 `HTTP_PROXY` |
| `HTTP_PROXY` | API 网络代理，例如 `http://127.0.0.1:7890` |
| `IMAGE_PROXY_DOMAIN` | 返回图片的反向代理地址，例如 `https://images.example.com` |

`IMAGE_PROXY_DOMAIN` 仅改写 `imgen.x.ai` 图片链接，不代理 API 请求，也不会延长图片有效期。反向代理需将路径与查询参数转发到 `https://imgen.x.ai`；Files API 公开链接保持原样。

超时覆盖请求及完整响应体读取。生成较慢时，MCP 客户端的工具超时也应不小于服务端超时。客户端取消调用会中止网络请求，但上游任务仍可能完成并计费。当前服务使用同步图像接口。

## 开发

```bash
npm ci
npm test
```

`npm test` 会构建项目，并通过 stdio 和本地 API 桩验证工具行为，无需密钥，也不会产生付费调用。CI 覆盖 Node 22、24，发布前通过检查，再使用 Node 24 发布。

使用当前源码版本时，构建后在 MCP 配置中以 `node` 和 `dist/index.js` 的绝对路径启动，替代 `npx`。使用 nvm 时，可在当前 shell 执行 `nvm use 22` 或 `nvm use 24`，无需修改默认别名。GUI 客户端可能需要填写 Node 可执行文件的绝对路径。

## 许可证

MIT
