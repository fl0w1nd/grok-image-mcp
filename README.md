# Grok Image MCP

[English](#english) | [中文](#中文)

---

<a id="english"></a>

An MCP (Model Context Protocol) server for image generation and editing using the [Grok](https://docs.x.ai/developers/model-capabilities/images/generation) image model from xAI.

> **Note**: This package was previously published as [`grok2-image-mcp-server`](https://www.npmjs.com/package/grok2-image-mcp-server). That package is now deprecated — please use `grok-image-mcp` instead.

## Features

- **Image Generation** — Generate images from text prompts with configurable aspect ratio, resolution, and batch count
- **Image Editing** — Edit existing images with natural language instructions, supporting 1–3 source images
- **Local File Support** — Provide local image paths for editing; the server reads and encodes them automatically
- **Image Proxy** — Optional proxy domain for `imgen.x.ai` to handle network restrictions
- **HTTP Proxy** — Optional network proxy for API requests

## Installation

### Using npx (recommended)

```json
{
  "mcpServers": {
    "grok_image": {
      "command": "npx",
      "args": ["grok-image-mcp"],
      "env": {
        "XAIAPI_KEY": "your-xai-api-key"
      }
    }
  }
}
```

## Tools

### `generate_image`

Generate images from text prompts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `prompt` | string | ✅ | Text description of the image to generate |
| `n` | number | | Number of images (1–10, default 1) |
| `aspect_ratio` | string | | Aspect ratio (`1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `2:1`, `1:2`, `auto`, etc.) |
| `resolution` | string | | Resolution (`1k` or `2k`, default 1k) |

### `edit_image`

Edit existing images using a text prompt.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `prompt` | string | ✅ | Text description of the desired edits |
| `image_urls` | string[] | ✅ | 1–3 source images: URLs, base64 data URIs, or local file paths |
| `n` | number | | Number of output images (1–10, default 1) |
| `aspect_ratio` | string | | Override output aspect ratio (default: follows first input image) |
| `resolution` | string | | Resolution (`1k` or `2k`, default 1k) |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `XAIAPI_KEY` | ✅ | xAI API key |
| `XAIAPI_BASE_URL` | | API base URL (default: `https://api.x.ai/v1`). Use a proxy if the API is inaccessible |
| `IMAGE_PROXY_DOMAIN` | | Proxy domain to replace `imgen.x.ai` in returned image URLs |
| `HTTP_PROXY` | | HTTP/HTTPS proxy for API requests (e.g. `http://127.0.0.1:7890`) |

### Proxy Examples

**API proxy**:

```bash
XAIAPI_BASE_URL=https://api-proxy.me/xai/v1
```

**Image proxy**:

```bash
IMAGE_PROXY_DOMAIN=https://image.proxy.workers.dev
```

**Network proxy**:

```bash
HTTP_PROXY=http://127.0.0.1:7890
```

### Using Cloudflare Workers to Proxy Image URLs

If image URLs from `imgen.x.ai` are inaccessible, deploy a Cloudflare Worker as a reverse proxy and set `IMAGE_PROXY_DOMAIN` to your custom domain:

```js
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const TARGET_DOMAIN = 'imgen.x.ai'

async function handleRequest(request) {
  const url = new URL(request.url)
  const targetUrl = `https://${TARGET_DOMAIN}${url.pathname}${url.search}`

  const init = {
    method: request.method,
    headers: request.headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'follow'
  }

  const response = await fetch(targetUrl, init)

  const newHeaders = new Headers(response.headers)
  newHeaders.set('Access-Control-Allow-Origin', '*')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  })
}
```

## License

MIT

---

<a id="中文"></a>

基于 [MCP](https://modelcontextprotocol.io/) 协议的 [Grok](https://docs.x.ai/developers/model-capabilities/images/generation) 图像生成与编辑服务。

> **注意**: 此包的前身是 [`grok2-image-mcp-server`](https://www.npmjs.com/package/grok2-image-mcp-server)，该包已弃用，请使用 `grok-image-mcp`。

## 功能

- **图像生成** — 通过文本提示生成图像，可配置宽高比、分辨率和批量数量
- **图像编辑** — 使用自然语言编辑现有图像，支持 1–3 张源图
- **本地文件支持** — 可提供本地图片路径进行编辑，服务端自动读取并编码
- **图片代理** — 可选代理域名替换 `imgen.x.ai`，解决网络访问问题
- **网络代理** — 支持 HTTP/HTTPS 代理

## 安装

### 使用 npx（推荐）

```json
{
  "mcpServers": {
    "grok_image": {
      "command": "npx",
      "args": ["grok-image-mcp"],
      "env": {
        "XAIAPI_KEY": "你的 xAI API 密钥"
      }
    }
  }
}
```

## 工具

### `generate_image`

通过文本提示生成图像。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `prompt` | string | ✅ | 描述要生成的图像内容 |
| `n` | number | | 生成数量（1–10，默认 1） |
| `aspect_ratio` | string | | 宽高比（`1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`、`2:1`、`1:2`、`auto` 等） |
| `resolution` | string | | 分辨率（`1k` 或 `2k`，默认 1k） |

### `edit_image`

使用文本提示编辑现有图像。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `prompt` | string | ✅ | 描述所需的编辑内容 |
| `image_urls` | string[] | ✅ | 1–3 张源图：URL、base64 data URI 或本地文件路径 |
| `n` | number | | 输出图像数量（1–10，默认 1） |
| `aspect_ratio` | string | | 覆盖输出宽高比（默认跟随第一张输入图） |
| `resolution` | string | | 分辨率（`1k` 或 `2k`，默认 1k） |

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `XAIAPI_KEY` | ✅ | xAI API 密钥 |
| `XAIAPI_BASE_URL` | | API 基础地址（默认 `https://api.x.ai/v1`），可填写代理地址 |
| `IMAGE_PROXY_DOMAIN` | | 图片代理域名，替换返回 URL 中的 `imgen.x.ai` |
| `HTTP_PROXY` | | HTTP/HTTPS 网络代理地址（如 `http://127.0.0.1:7890`） |

### 代理示例

**API 代理**：

```bash
XAIAPI_BASE_URL=https://api-proxy.me/xai/v1
```

**图片代理**：

```bash
IMAGE_PROXY_DOMAIN=https://image.proxy.workers.dev
```

**网络代理**：

```bash
HTTP_PROXY=http://127.0.0.1:7890
```

### 使用 Cloudflare Workers 代理图片 URL

如果 `imgen.x.ai` 的图片无法访问，可部署 Cloudflare Worker 反向代理，然后将 `IMAGE_PROXY_DOMAIN` 设为你的自定义域名：

```js
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const TARGET_DOMAIN = 'imgen.x.ai'

async function handleRequest(request) {
  const url = new URL(request.url)
  const targetUrl = `https://${TARGET_DOMAIN}${url.pathname}${url.search}`

  const init = {
    method: request.method,
    headers: request.headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'follow'
  }

  const response = await fetch(targetUrl, init)

  const newHeaders = new Headers(response.headers)
  newHeaders.set('Access-Control-Allow-Origin', '*')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  })
}
```

## 许可证

MIT
