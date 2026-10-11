import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fetch, ProxyAgent } from "undici";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { createRequire } from "node:module";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const MODELS = ["grok-imagine-image", "grok-imagine-image-2.0"] as const;
const ASPECT_RATIOS = [
  "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "2:1", "1:2",
  "19.5:9", "9:19.5", "20:9", "9:20", "21:9", "5:2", "auto",
] as const;
const nonempty = z.string().trim().min(1);
const expiry = z.number().int().min(3600).max(2592000);
const storageSchema = z.object({
  filename: nonempty.describe("Filename for the stored image, e.g. landscape.jpg"),
  expires_after: expiry.optional().describe("File lifetime in seconds; omitted means permanent storage"),
  public_url: z.union([z.boolean(), z.object({ expires_after: expiry.optional() })]).optional()
    .describe("Explicitly create a public link; omitted means private storage"),
});
const commonInput = {
  prompt: nonempty.describe("Describe the image to generate or the desired edits"),
  model: z.enum(MODELS).optional().describe("Overrides XAI_IMAGE_MODEL (default: grok-imagine-image). Choose grok-imagine-image-2.0 for quality control and up to 5 inputs"),
  n: z.number().int().min(1).max(10).optional().describe("Number of output images (default: 1)"),
  aspect_ratio: z.enum(ASPECT_RATIOS).optional().describe("Generation defaults to auto; editing follows the first input. 21:9 and 5:2 require image 2.0"),
  resolution: z.enum(["1k", "2k"]).optional().describe("Output resolution (default: 1k)"),
  quality: z.enum(["low", "medium", "auto"]).optional().describe("Image 2.0 only. Auto uses low for generation and medium for editing; billing follows the served quality"),
  response_format: z.enum(["url", "b64_json"]).optional().describe("url returns temporary links (default); b64_json returns MCP image content"),
  storage_options: storageSchema.optional().describe("Persist outputs in the Files API; private unless public_url is explicitly enabled"),
};
const generateSchema = z.object(commonInput);
const sourceSchema = z.union([
  z.object({ url: nonempty }).strict(),
  z.object({ file_id: nonempty }).strict(),
]);
const editSchema = z.object({
  ...commonInput,
  image_urls: z.array(nonempty).min(1).max(5).optional()
    .describe("Source URLs, base64 data URIs, or local paths, in order. Supply either image_urls or images. 1.0 allows 3; 2.0 allows 5"),
  images: z.array(sourceSchema).min(1).max(5).optional()
    .describe("Ordered sources as {url: URL, data URI, or local path} or {file_id: Files API ID}. Supply either images or image_urls"),
});
const fileOutputSchema = z.object({
  file_id: nonempty,
  filename: z.string().optional(),
  expires_at: z.number().optional(),
  public_url: z.string().optional(),
  public_url_expires_at: z.number().optional(),
  public_url_error: z.string().optional(),
});
const imageSchema = z.object({
  url: nonempty.nullish(),
  b64_json: nonempty.nullish(),
  mime_type: nonempty.nullish(),
  revised_prompt: z.string().nullish(),
  respect_moderation: z.boolean().optional(),
  file_output: fileOutputSchema.nullish(),
});
const responseSchema = z.object({
  data: z.array(imageSchema).min(1),
  model: z.string().optional(),
  quality: z.string().nullish(),
  usage: z.record(z.string(), z.unknown()).optional(),
});
const outputSchema = z.object({
  images: z.array(imageSchema.omit({ b64_json: true }).extend({
    inline: z.boolean().optional().describe("Image bytes are in the corresponding MCP image content block"),
  })).min(1),
  model: z.string().optional(),
  quality: z.string().nullish(),
  usage: z.record(z.string(), z.unknown()).optional(),
});
type ImageResponse = z.infer<typeof responseSchema>;
type GenerateInput = z.infer<typeof generateSchema>;

function selectedModel(input: GenerateInput) {
  const model = z.enum(MODELS).safeParse(input.model ?? process.env.XAI_IMAGE_MODEL ?? MODELS[0]);
  if (!model.success) throw new Error(`Unsupported model. Choose ${MODELS.join(" or ")}.`);
  if (model.data !== "grok-imagine-image-2.0") {
    if (input.quality !== undefined) throw new Error("quality requires grok-imagine-image-2.0.");
    if (input.aspect_ratio === "21:9" || input.aspect_ratio === "5:2") {
      throw new Error(`${input.aspect_ratio} requires grok-imagine-image-2.0.`);
    }
  }
  return model.data;
}

async function callXaiApi(endpoint: string, body: Record<string, unknown>, cancellation: AbortSignal): Promise<ImageResponse> {
  const apiKey = process.env.XAI_API_KEY || process.env.XAIAPI_KEY;
  if (!apiKey) throw new Error("Missing API key. Set XAI_API_KEY (or XAIAPI_KEY).");
  const baseURL = (process.env.XAIAPI_BASE_URL || "https://api.x.ai/v1").replace(/\/+$/, "");
  const timeoutMs = Number(process.env.XAI_TIMEOUT_MS ?? 180000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) {
    throw new Error("XAI_TIMEOUT_MS must be a positive integer no greater than 2147483647.");
  }
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = AbortSignal.any([controller.signal, cancellation]);
  try {
    const response = await fetch(`${baseURL}${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
      dispatcher,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`API error (${response.status}): ${text.slice(0, 1000) || response.statusText}`);
    }
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new Error("API returned a non-JSON response."); }
    const parsed = responseSchema.safeParse(data);
    if (!parsed.success) throw new Error("API returned an invalid image response or no images.");
    return parsed.data;
  } catch (error) {
    if (cancellation.aborted) throw new Error("Request cancelled.");
    if (controller.signal.aborted) throw new Error(`Request timed out (${timeoutMs}ms). The upstream request may still be billed.`);
    throw error;
  } finally {
    clearTimeout(timer);
    await dispatcher?.destroy();
  }
}

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
};
async function resolveImageInput(input: string): Promise<string> {
  if (/^https?:\/\//i.test(input) || input.startsWith("data:")) return input;
  const ext = extname(input).toLowerCase();
  const mime = MIME_TYPES[ext];
  if (!mime) throw new Error(`Unsupported local image format: ${ext || "unknown"}. Use PNG, JPEG, or WebP.`);
  const buffer = await readFile(input);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function proxyImageUrl(value: string): string {
  const domain = process.env.IMAGE_PROXY_DOMAIN;
  const url = new URL(value);
  if (!domain || url.hostname !== "imgen.x.ai") return value;
  const proxy = new URL(domain.includes("://") ? domain : `https://${domain}`);
  if (proxy.protocol !== "https:" && proxy.protocol !== "http:") throw new Error("IMAGE_PROXY_DOMAIN must use HTTP or HTTPS.");
  proxy.pathname = `${proxy.pathname.replace(/\/$/, "")}${url.pathname}`;
  proxy.search = url.search;
  return proxy.toString();
}

function buildImageResult(result: ImageResponse): CallToolResult {
  const content: CallToolResult["content"] = [];
  const images = result.data.map((item, index) => {
    if (!item.url && !item.b64_json && !item.file_output?.file_id) {
      throw new Error("API returned an image without a URL, image bytes, or stored file.");
    }
    const { b64_json, ...image } = item;
    if (image.url) {
      image.url = proxyImageUrl(image.url);
      content.push({ type: "text", text: `![image_${index + 1}](${image.url})` });
    }
    if (b64_json) {
      content.push({ type: "image", data: b64_json, mimeType: image.mime_type ?? "image/jpeg" });
    }
    return { ...image, ...(b64_json ? { inline: true } : {}) };
  });
  const structuredContent = {
    images,
    ...(result.model ? { model: result.model } : {}),
    ...(result.quality ? { quality: result.quality } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
  };
  content.push({ type: "text", text: JSON.stringify(structuredContent) });
  return { content, structuredContent, isError: false };
}

function toolError(error: unknown): CallToolResult {
  let message = error instanceof Error ? error.message : "Unknown error";
  for (const key of [process.env.XAI_API_KEY, process.env.XAIAPI_KEY]) {
    if (key) message = message.replaceAll(key, "[redacted]");
  }
  return { content: [{ type: "text", text: `Image request failed: ${message}` }], isError: true };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "Grok Image MCP Server", version });
  const annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
  server.registerTool("generate_image", {
    description: "Generate images with xAI. Model and quality affect cost. URLs are temporary unless persisted with storage_options. b64_json returns inline image content.",
    inputSchema: generateSchema,
    outputSchema,
    annotations,
  }, async (input, ctx) => {
    try {
      const body = { ...input, model: selectedModel(input) };
      return buildImageResult(await callXaiApi("/images/generations", body, ctx.mcpReq.signal));
    } catch (error) { return toolError(error); }
  });
  server.registerTool("edit_image", {
    description: "Edit images with xAI using ordered URLs, data URIs, local paths, or Files API IDs. Supports up to 3 source images with 1.0 or 5 with 2.0. URLs are temporary unless persisted.",
    inputSchema: editSchema,
    outputSchema,
    annotations,
  }, async (input, ctx) => {
    try {
      const model = selectedModel(input);
      if (Boolean(input.image_urls) === Boolean(input.images)) {
        throw new Error("Supply exactly one of image_urls or images.");
      }
      const sources = input.images ?? input.image_urls!.map(url => ({ url }));
      const limit = model === "grok-imagine-image-2.0" ? 5 : 3;
      if (sources.length > limit) throw new Error(`${model} supports at most ${limit} source images.`);
      const resolved = await Promise.all(sources.map(async source => "file_id" in source
        ? { file_id: source.file_id }
        : { url: await resolveImageInput(source.url), type: "image_url" }));
      const { image_urls: _urls, images: _images, ...options } = input;
      const body = { ...options, model, ...(resolved.length === 1 ? { image: resolved[0] } : { images: resolved }) };
      return buildImageResult(await callXaiApi("/images/edits", body, ctx.mcpReq.signal));
    } catch (error) { return toolError(error); }
  });
  return server;
}
