import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProxyAgent } from "undici";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const ASPECT_RATIOS = [
  "1:1", "16:9", "9:16", "4:3", "3:4",
  "3:2", "2:3", "2:1", "1:2",
  "19.5:9", "9:19.5", "20:9", "9:20", "auto",
] as const;

function getConfig() {
  const apiKey = process.env.XAIAPI_KEY;
  if (!apiKey) {
    throw new Error("Missing API key. Please set the XAIAPI_KEY environment variable.");
  }
  const baseURL = process.env.XAIAPI_BASE_URL || "https://api.x.ai/v1";
  const proxy = process.env.HTTP_PROXY;
  return { apiKey, baseURL, proxy };
}

async function callXaiApi(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const { apiKey, baseURL, proxy } = getConfig();
  const url = `${baseURL}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  const options: RequestInit & { dispatcher?: unknown } = {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  };

  if (proxy) {
    options.dispatcher = new ProxyAgent({ uri: proxy });
  }

  const response = await fetch(url, options);
  clearTimeout(timeoutId);

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`API error (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

interface ImageData {
  url?: string;
  revised_prompt?: string;
}

interface ImageResponse {
  data: ImageData[];
}

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

async function resolveImageInput(input: string): Promise<string> {
  if (input.startsWith("http://") || input.startsWith("https://") || input.startsWith("data:")) {
    return input;
  }

  const ext = extname(input).toLowerCase();
  const mime = MIME_TYPES[ext];
  if (!mime) {
    throw new Error(`Unsupported image format: ${ext || "unknown"} (path: ${input})`);
  }

  const buffer = await readFile(input);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function proxyImageUrl(url: string): string {
  const proxyDomain = process.env.IMAGE_PROXY_DOMAIN;
  if (!proxyDomain || !url.includes("imgen.x.ai")) return url;

  const replacement = proxyDomain.startsWith("https://") ? proxyDomain : `https://${proxyDomain}`;
  return url.replace("https://imgen.x.ai", replacement);
}

function buildImageContents(result: ImageResponse) {
  const parts: string[] = [];

  for (let i = 0; i < result.data.length; i++) {
    const item = result.data[i];
    if (item.url) {
      parts.push(`![image_${i + 1}](${proxyImageUrl(item.url)})`);
    }
    if (item.revised_prompt) {
      parts.push(`Revised prompt: ${item.revised_prompt}`);
    }
  }

  return parts.join("\n\n");
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "Grok Image Generation MCP Server",
    version: "1.0.0",
  });

  server.tool(
    "generate_image",
    "Generate images from text prompts using the Grok image model. Returns image URLs in markdown format. Note: URLs are temporary, download or process promptly.",
    {
      prompt: z.string().describe("Text description of the image to generate"),
      n: z.number().int().min(1).max(10).optional().describe("Number of images to generate (1-10, default 1)"),
      aspect_ratio: z.enum(ASPECT_RATIOS).optional().describe("Aspect ratio of the generated image (default: auto)"),
      resolution: z.enum(["1k", "2k"]).optional().describe("Resolution of the generated image (default: 1k)"),
    },
    async ({ prompt, n, aspect_ratio, resolution }) => {
      try {
        const body: Record<string, unknown> = {
          model: "grok-imagine-image",
          prompt,
        };
        if (n !== undefined) body.n = n;
        if (aspect_ratio !== undefined) body.aspect_ratio = aspect_ratio;
        if (resolution !== undefined) body.resolution = resolution;

        const result = await callXaiApi("/images/generations", body) as ImageResponse;
        const text = buildImageContents(result);

        if (!text) {
          return {
            content: [{ type: "text", text: "Image generation returned no data." }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text }],
          isError: false,
        };
      } catch (error: unknown) {
        const message = error instanceof Error
          ? (error.name === "AbortError" ? "Request timed out (60s)" : error.message)
          : "Unknown error";
        return {
          content: [{ type: "text", text: `Image generation failed: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "edit_image",
    "Edit existing images using a text prompt. Provide 1-3 source images (as URLs, base64 data URIs, or local file paths) along with editing instructions. Returns edited image URLs in markdown format.",
    {
      prompt: z.string().describe("Text description of the desired edits"),
      image_urls: z.array(z.string()).min(1).max(3).describe("Array of source image URLs, base64 data URIs, or local file paths (1-3 images)"),
      n: z.number().int().min(1).max(10).optional().describe("Number of images to generate (1-10, default 1)"),
      aspect_ratio: z.enum(ASPECT_RATIOS).optional().describe("Override the output aspect ratio (default: follows first input image)"),
      resolution: z.enum(["1k", "2k"]).optional().describe("Resolution of the output image (default: 1k)"),
    },
    async ({ prompt, image_urls, n, aspect_ratio, resolution }) => {
      try {
        const resolved = await Promise.all(image_urls.map(resolveImageInput));

        const body: Record<string, unknown> = {
          model: "grok-imagine-image",
          prompt,
        };

        if (resolved.length === 1) {
          body.image = { url: resolved[0], type: "image_url" };
        } else {
          body.images = resolved.map((url) => ({ url, type: "image_url" }));
        }

        if (n !== undefined) body.n = n;

        if (aspect_ratio !== undefined) body.aspect_ratio = aspect_ratio;
        if (resolution !== undefined) body.resolution = resolution;

        const result = await callXaiApi("/images/edits", body) as ImageResponse;
        const text = buildImageContents(result);

        if (!text) {
          return {
            content: [{ type: "text", text: "Image editing returned no data." }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text }],
          isError: false,
        };
      } catch (error: unknown) {
        const message = error instanceof Error
          ? (error.name === "AbortError" ? "Request timed out (60s)" : error.message)
          : "Unknown error";
        return {
          content: [{ type: "text", text: `Image editing failed: ${message}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}
