import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createSetsuMcpServer } from '@setsu-ai/mcp';

const here = dirname(fileURLToPath(import.meta.url));
const TS_SAMPLE = join(here, '..', '..', '..', '..', 'fixtures', 'ts-sample');

let repo: string;
let client: Client;
let handle: ReturnType<typeof createSetsuMcpServer>;

function firstText(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text: string }> }).content;
  return content?.[0]?.text ?? '';
}

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'setsu-mcp-'));
  await cp(TS_SAMPLE, repo, { recursive: true });
  process.env['SETSU_HOME'] = join(repo, '.setsu-home');
  handle = createSetsuMcpServer(repo, '0.0.0-test');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([handle.server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
  handle.close();
  delete process.env['SETSU_HOME'];
  await rm(repo, { recursive: true, force: true });
});

describe('SETSU MCP server', () => {
  it('exposes exactly the 5-tool minimal surface (spec section 27)', async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'setsu_context',
      'setsu_impact',
      'setsu_path',
      'setsu_status',
      'setsu_symbol',
    ]);
  });

  it('setsu_context returns a bounded evidence pack', async () => {
    const result = await client.callTool({
      name: 'setsu_context',
      arguments: { query: 'How does checkout reach the payment gateway?', maxTokens: 1200 },
    });
    const output = firstText(result);
    expect(output).toContain('[setsu] strategy=');
    expect(output).toContain('StripeAdapter');
    const match = output.match(/tokens~(\d+)\/(\d+)/);
    expect(match).toBeTruthy();
    expect(Number(match![1])).toBeLessThanOrEqual(1200);
  });

  it('setsu_symbol finds definition and callers', async () => {
    const result = await client.callTool({
      name: 'setsu_symbol',
      arguments: { name: 'validateOrder' },
    });
    const output = firstText(result);
    expect(output).toContain('src/orders/validation.ts');
    expect(output).toContain('callers:');
  });

  it('setsu_path connects controller to adapter', async () => {
    const result = await client.callTool({
      name: 'setsu_path',
      arguments: { from: 'CheckoutService', to: 'StripeAdapter' },
    });
    expect(firstText(result)).toContain('StripeAdapter');
  });

  it('setsu_impact lists dependents and files', async () => {
    const result = await client.callTool({
      name: 'setsu_impact',
      arguments: { name: 'CustomerStatus' },
    });
    const output = firstText(result);
    expect(output).toContain('files affected');
    expect(output).toContain('validation');
  });

  it('setsu_status reports graph freshness', async () => {
    const result = await client.callTool({ name: 'setsu_status', arguments: {} });
    const output = firstText(result);
    expect(output).toMatch(/symbols: \d+/);
    expect(output).toMatch(/graph revision: [1-9]/);
  });
});
