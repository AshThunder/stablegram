import type { IncomingMessage, ServerResponse } from 'node:http';

const RPC = {
  mainnet: 'https://rpc.mainnet.arc.io',
  testnet: 'https://rpc.testnet.arc.io',
} as const;

function readRaw(req: IncomingMessage): Promise<string> {
  const preset = (req as IncomingMessage & { body?: unknown }).body;
  if (typeof preset === 'string') return Promise.resolve(preset);
  if (preset && typeof preset === 'object') return Promise.resolve(JSON.stringify(preset));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://localhost');
  const network = url.searchParams.get('network') === 'mainnet' ? 'mainnet' : 'testnet';
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'POST only' }));
    return;
  }
  try {
    const body = await readRaw(req);
    if (body.length > 64_000) {
      res.statusCode = 413;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'Request too large' }));
      return;
    }
    const upstream = await fetch(RPC[network], {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body || '{}',
    });
    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('content-type', 'application/json');
    res.end(text);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Arc did not answer' }));
  }
}
