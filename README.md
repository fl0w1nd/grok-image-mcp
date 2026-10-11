# Grok Image MCP

[English](#english) | [中文](#中文)

<a id="english"></a>

An MCP server for generating and editing images with the [xAI image API](https://docs.x.ai/developers/model-capabilities/images/generation). Supports model and quality selection, local images, stored files, and inline image results over stdio.

Requires **Node.js 22.19+** and an xAI API key.

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

The server exposes `generate_image` and `edit_image`. Example `generate_image` arguments:

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
| Quality parameter | — | `low`, `medium`, `auto` |
| Additional aspect ratios | — | `21:9`, `5:2` |

The `model` argument overrides `XAI_IMAGE_MODEL`. The default is `grok-imagine-image`.

On 2.0, quality defaults to `auto`: `low` for generation and `medium` for editing. See [xAI pricing](https://docs.x.ai/developers/pricing) for costs.

## Tools

Both tools accept these parameters:

| Parameter | Type | Description |
|---|---|---|
| `prompt` | string, required | Image description or editing instructions |
| `model` | string | One of the two models above |
| `n` | integer | Output count, 1–10; default 1 |
| `aspect_ratio` | string | Generation defaults to `auto`; editing follows the first input |
| `resolution` | string | `1k` or `2k`; default `1k` |
| `quality` | string | 2.0: `low`, `medium`, `auto` |
| `response_format` | string | `url` (default) or `b64_json` for inline MCP image content |
| `storage_options` | object | Save generated images to the Files API |

Aspect ratios: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `2:1`, `1:2`, `19.5:9`, `9:19.5`, `20:9`, `9:20`, `auto`; 2.0 additionally supports `21:9` and `5:2`.

### Editing

For `edit_image`, supply one of these source lists:

- `image_urls`: ordered array of public URLs, base64 data URIs, or local paths.
- `images`: ordered array of `{ "url": "..." }` or `{ "file_id": "..." }` objects. `url` also accepts data URIs and local paths.

```json
{
  "prompt": "Replace the background with a snowy forest",
  "image_urls": ["/absolute/path/to/photo.png"]
}
```

Local files support PNG, JPEG and WebP. Relative paths resolve from the server's working directory.

### Results

`structuredContent.images` contains image URLs, revised prompts, MIME types and stored-file metadata. Model, quality and usage are included when returned by xAI.

- `url`: temporary image links, also returned as Markdown. Use `storage_options` to save images.
- `b64_json`: MCP `image` content blocks, with `inline: true` in the corresponding structured entry.

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

This saves the image privately for one day. Use `structuredContent.images[0].file_output.file_id` in a subsequent edit:

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
| `expires_after` | File lifetime in seconds, 3600–2592000; default: permanent |
| `public_url` | `true` creates a shareable public link; default: private |
| `public_url.expires_after` | Use `public_url: { "expires_after": 86400 }` to set a link lifetime |

See [xAI storage documentation](https://docs.x.ai/developers/model-capabilities/imagine/files/outputs) for details.

## Configuration and networking

| Environment variable | Description |
|---|---|
| `XAI_API_KEY` | xAI API key; takes precedence over `XAIAPI_KEY` |
| `XAIAPI_KEY` | Alternative API-key variable |
| `XAI_IMAGE_MODEL` | Default model; `grok-imagine-image` when omitted |
| `XAIAPI_BASE_URL` | API base URL; default `https://api.x.ai/v1` |
| `XAI_TIMEOUT_MS` | Request timeout in milliseconds; default `180000` |
| `HTTPS_PROXY` | Network proxy for API requests; takes precedence over `HTTP_PROXY` |
| `HTTP_PROXY` | Network proxy, e.g. `http://127.0.0.1:7890` |
| `IMAGE_PROXY_DOMAIN` | Reverse proxy for returned `imgen.x.ai` URLs, e.g. `https://images.example.com` |

For `IMAGE_PROXY_DOMAIN`, configure your reverse proxy to forward paths and query strings to `https://imgen.x.ai`.

For long generations, set the MCP client's tool timeout to `XAI_TIMEOUT_MS` or longer.

## Development

```bash
npm ci
npm test
```

To use a local build, configure your MCP client to run `node` with the absolute path to `dist/index.js`.

## License

MIT

---

<a id="中文"></a>

基于 [xAI 图像 API](https://docs.x.ai/developers/model-capabilities/images/generation) 的 MCP 服务，支持选择模型与质量、编辑本地图片或已存储的图片，并返回图片链接或内联图片。使用 stdio 传输。

需要 **Node.js 22.19+** 和 xAI API 密钥。

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

服务提供 `generate_image` 和 `edit_image` 两个工具。`generate_image` 调用示例：

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
| 质量参数 | — | `low`、`medium`、`auto` |
| 新增宽高比 | — | `21:9`、`5:2` |

调用时的 `model` 优先于环境变量 `XAI_IMAGE_MODEL`，默认值为 `grok-imagine-image`。

2.0 的质量默认为 `auto`：生成对应 `low`，编辑对应 `medium`。费用见 [xAI 定价](https://docs.x.ai/developers/pricing)。

## 工具参数

两个工具共用以下参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `prompt` | string，必填 | 图片描述或编辑指令 |
| `model` | string | 上表中的模型之一 |
| `n` | integer | 输出数量，1–10，默认 1 |
| `aspect_ratio` | string | 生成默认 `auto`；编辑默认跟随第一张源图 |
| `resolution` | string | `1k` 或 `2k`，默认 `1k` |
| `quality` | string | 2.0：`low`、`medium`、`auto` |
| `response_format` | string | 默认 `url`；`b64_json` 返回 MCP 原生图片内容 |
| `storage_options` | object | 将输出保存至 Files API |

宽高比支持 `1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`、`2:1`、`1:2`、`19.5:9`、`9:19.5`、`20:9`、`9:20`、`auto`；2.0 还支持 `21:9`、`5:2`。

### 编辑图片

`edit_image` 的源图列表使用以下一种形式：

- `image_urls`：按顺序提供公开 URL、base64 data URI 或本地路径。
- `images`：按顺序提供 `{ "url": "..." }` 或 `{ "file_id": "..." }` 对象。`url` 也接受 data URI 和本地路径。

```json
{
  "prompt": "将背景替换成雪中的森林",
  "image_urls": ["/absolute/path/to/photo.png"]
}
```

本地文件支持 PNG、JPEG、WebP。相对路径以服务的工作目录为基准。

### 返回结果

`structuredContent.images` 包含图片 URL、修改后的提示词、MIME 类型和文件存储信息；模型、质量、用量信息随 xAI 返回内容提供。

- `url`：临时图片链接，同时以 Markdown 返回。使用 `storage_options` 可保存图片。
- `b64_json`：MCP `image` 内容块，对应的结构化条目标记为 `inline: true`。

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

上述配置将图片私有保存一天。从 `structuredContent.images[0].file_output.file_id` 取得文件 ID，随后编辑时复用：

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
| `expires_after` | 文件有效期，3600–2592000 秒；默认永久保存 |
| `public_url` | 设为 `true` 创建公开分享链接；默认为私有存储 |
| `public_url.expires_after` | 使用 `public_url: { "expires_after": 86400 }` 指定公开链接有效期 |

详见 [xAI 存储文档](https://docs.x.ai/developers/model-capabilities/imagine/files/outputs)。

## 环境变量与网络

| 变量 | 说明 |
|---|---|
| `XAI_API_KEY` | API 密钥，优先于 `XAIAPI_KEY` |
| `XAIAPI_KEY` | API 密钥的另一个变量名 |
| `XAI_IMAGE_MODEL` | 默认模型，未设置时为 `grok-imagine-image` |
| `XAIAPI_BASE_URL` | API 基础地址，默认 `https://api.x.ai/v1` |
| `XAI_TIMEOUT_MS` | 请求超时毫秒数，默认 `180000` |
| `HTTPS_PROXY` | API 网络代理，优先于 `HTTP_PROXY` |
| `HTTP_PROXY` | API 网络代理，例如 `http://127.0.0.1:7890` |
| `IMAGE_PROXY_DOMAIN` | 返回图片的反向代理地址，例如 `https://images.example.com` |

使用 `IMAGE_PROXY_DOMAIN` 时，反向代理需将路径与查询参数转发到 `https://imgen.x.ai`。

生成耗时较长时，将 MCP 客户端的工具超时设为 `XAI_TIMEOUT_MS` 或更长。

## 开发

```bash
npm ci
npm test
```

使用本地构建时，在 MCP 客户端中配置 `node` 和 `dist/index.js` 的绝对路径。

## 许可证

MIT
