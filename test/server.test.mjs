import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const requests = [];
const protocolErrors = [];
let reply;
let client;
let baseURL;
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=';
const api = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = { path: req.url, body: JSON.parse(Buffer.concat(chunks).toString()) };
  requests.push(request);
  reply(res, request);
});
function json(res, body, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
async function connect(overrides = {}) {
  const c = new Client({ name: 'grok-image-tests', version: '1.0.0' });
  c.onerror = error => protocolErrors.push(error);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve('dist/index.js')],
    env: {
      PATH: process.env.PATH ?? '',
      XAI_API_KEY: 'test-key', XAIAPI_KEY: '', XAIAPI_BASE_URL: `${baseURL}/`,
      XAI_TIMEOUT_MS: '300', XAI_IMAGE_MODEL: 'grok-imagine-image',
      HTTP_PROXY: '', HTTPS_PROXY: '', IMAGE_PROXY_DOMAIN: 'https://images.example.test',
      ...overrides,
    },
    stderr: 'pipe',
  });
  await c.connect(transport);
  await c.listTools();
  return c;
}
async function call(name, args) {
  return client.callTool({ name, arguments: args });
}
function errorText(result) {
  assert.equal(result.isError, true);
  return result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
}
before(async () => {
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${api.address().port}/v1`;
  client = await connect();
});
after(async () => {
  await client?.close();
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
});

test('stdio exposes both tools with output schemas and no protocol noise', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), ['edit_image', 'generate_image']);
  assert.ok(tools.every(t => t.outputSchema?.properties.images));
  assert.deepEqual(protocolErrors, []);
});

test('generation preserves default model, proxy links and structured metadata', async () => {
  reply = res => json(res, {
    data: [{ url: 'https://imgen.x.ai/image.jpg?token=abc', mime_type: 'image/jpeg', revised_prompt: 'A landscape' }],
    model: 'grok-imagine-image', usage: { cost_in_usd_ticks: 200000000 },
  });
  const result = await call('generate_image', { prompt: 'A landscape' });
  assert.equal(result.isError, false);
  assert.equal(requests.at(-1).path, '/v1/images/generations');
  assert.equal(requests.at(-1).body.model, 'grok-imagine-image');
  assert.equal(result.structuredContent.images[0].url, 'https://images.example.test/image.jpg?token=abc');
  assert.equal(result.structuredContent.images[0].revised_prompt, 'A landscape');
  assert.equal(result.structuredContent.usage.cost_in_usd_ticks, 200000000);
  assert.ok(result.content.some(c => c.type === 'text' && c.text.startsWith('![image_1]')));
});

test('2.0 quality, resolution, aspect ratio and storage reach the image API', async () => {
  const file_output = { file_id: 'file-generated', filename: 'scene.jpg', public_url_error: 'Public URL quota reached' };
  reply = res => json(res, { data: [{ url: 'https://cdn.example.test/scene.jpg', file_output }], model: 'grok-imagine-image-2.0', quality: 'low' });
  const args = {
    prompt: 'A scene', model: 'grok-imagine-image-2.0', quality: 'low', aspect_ratio: '21:9', resolution: '2k', n: 2,
    storage_options: { filename: 'scene.jpg', expires_after: 3600 },
  };
  const result = await call('generate_image', args);
  assert.equal(result.isError, false);
  assert.deepEqual(requests.at(-1).body, args);
  assert.deepEqual(result.structuredContent.images[0].file_output, file_output);
});

test('unsupported model options fail before spending an API request', async () => {
  const count = requests.length;
  for (const options of [{ quality: 'low' }, { aspect_ratio: '5:2' }]) {
    assert.match(errorText(await call('generate_image', { prompt: 'A scene', ...options })), /requires grok-imagine-image-2.0/);
  }
  assert.match(errorText(await call('edit_image', { prompt: 'Merge', image_urls: Array(4).fill('https://example.test/a.png') })), /at most 3/);
  assert.equal(requests.length, count);
});

test('editing accepts five ordered sources including stored file IDs on 2.0', async () => {
  reply = res => json(res, { data: [{ url: 'https://example.test/result.jpg' }] });
  const sources = [
    { url: 'https://example.test/first.png' }, { file_id: 'file-second' },
    { url: `data:image/png;base64,${pixel}` }, { file_id: 'file-fourth' }, { file_id: 'file-fifth' },
  ];
  const result = await call('edit_image', { prompt: 'Merge subjects', model: 'grok-imagine-image-2.0', quality: 'medium', images: sources });
  assert.equal(result.isError, false);
  assert.equal(requests.at(-1).path, '/v1/images/edits');
  assert.deepEqual(requests.at(-1).body.images, sources.map(s => 'url' in s ? { ...s, type: 'image_url' } : s));
  assert.equal(requests.at(-1).body.image, undefined);
});

test('single local image is read and encoded for the edit endpoint', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'grok-image-test-'));
  const checkedDir = await realpath(dir);
  const path = join(checkedDir, 'pixel.png');
  try {
    await writeFile(path, Buffer.from(pixel, 'base64'));
    reply = res => json(res, { data: [{ url: 'https://example.test/edited.jpg' }] });
    const result = await call('edit_image', { prompt: 'Change color', image_urls: [path] });
    assert.equal(result.isError, false);
    assert.deepEqual(requests.at(-1).body.image, { type: 'image_url', url: `data:image/png;base64,${pixel}` });
    assert.equal(requests.at(-1).body.image_urls, undefined);
  } finally {
    assert.equal(await realpath(dir), checkedDir);
    await rm(checkedDir, { recursive: true });
  }
});

test('missing or ambiguous edit inputs are rejected without an API request', async () => {
  const count = requests.length;
  for (const sources of [{}, { image_urls: ['https://example.test/a.jpg'], images: [{ file_id: 'file-a' }] }]) {
    assert.match(errorText(await call('edit_image', { prompt: 'Edit', ...sources })), /exactly one/);
  }
  assert.equal(requests.length, count);
});

test('base64 response becomes native MCP image content without duplicating image bytes in JSON', async () => {
  reply = res => json(res, { data: [{ b64_json: pixel, mime_type: 'image/png', url: null }] });
  const result = await call('generate_image', { prompt: 'A dot', response_format: 'b64_json' });
  assert.equal(result.isError, false);
  assert.ok(result.content.some(c => c.type === 'image' && c.data === pixel && c.mimeType === 'image/png'));
  assert.equal(result.structuredContent.images[0].inline, true);
  assert.equal(result.structuredContent.images[0].b64_json, undefined);
  assert.equal(requests.at(-1).body.response_format, 'b64_json');
});

test('HTTP and malformed responses produce useful MCP errors and redact API keys', async () => {
  reply = res => { res.writeHead(502); res.end('Gateway failed test-key'); };
  const message = errorText(await call('generate_image', { prompt: 'A dot' }));
  assert.match(message, /502.*Gateway failed/);
  assert.ok(!message.includes('test-key'));
  reply = res => res.end('<html>unavailable</html>');
  assert.match(errorText(await call('generate_image', { prompt: 'A dot' })), /non-JSON/);
  for (const data of [[], [{ revised_prompt: 'No actual image' }]]) {
    reply = res => json(res, { data });
    assert.equal((await call('generate_image', { prompt: 'A dot' })).isError, true);
  }
});

test('timeout covers reading the response body, not just response headers', async () => {
  reply = res => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"data":');
  };
  assert.match(errorText(await call('generate_image', { prompt: 'A dot' })), /timed out \(300ms\)/);
});

test('MCP cancellation closes the outgoing HTTP request before its timeout', { timeout: 3000 }, async () => {
  const configured = await connect({ XAI_TIMEOUT_MS: '10000' });
  const started = Promise.withResolvers();
  const closed = Promise.withResolvers();
  try {
    reply = res => {
      res.on('close', closed.resolve);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"data":');
      started.resolve();
    };
    const controller = new AbortController();
    const pending = configured.callTool({ name: 'generate_image', arguments: { prompt: 'A dot' } }, { signal: controller.signal });
    const rejected = assert.rejects(pending);
    await started.promise;
    controller.abort();
    await rejected;
    await closed.promise;
  } finally { await configured.close(); }
});

test('environment model default works and explicit per-call model takes precedence', async () => {
  const configured = await connect({ XAI_IMAGE_MODEL: 'grok-imagine-image-2.0', XAI_API_KEY: '', XAIAPI_KEY: 'legacy-key' });
  try {
    reply = res => json(res, { data: [{ url: 'https://example.test/a.jpg' }] });
    assert.equal((await configured.callTool({ name: 'generate_image', arguments: { prompt: 'A dot', quality: 'low' } })).isError, false);
    assert.equal(requests.at(-1).body.model, 'grok-imagine-image-2.0');
    await configured.callTool({ name: 'generate_image', arguments: { prompt: 'A dot', model: 'grok-imagine-image' } });
    assert.equal(requests.at(-1).body.model, 'grok-imagine-image');
  } finally { await configured.close(); }
});

test('image proxy only rewrites the exact xAI image hostname', async () => {
  const url = 'https://imgen.x.ai.example.test/image.jpg';
  reply = res => json(res, { data: [{ url }] });
  const result = await call('generate_image', { prompt: 'A dot' });
  assert.equal(result.structuredContent.images[0].url, url);
  assert.deepEqual(protocolErrors, []);
});
