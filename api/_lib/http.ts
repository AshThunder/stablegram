import type { IncomingMessage, ServerResponse } from 'node:http';

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse & {
  status: (code: number) => Res;
  json: (body: unknown) => void;
};

export function readJson(req: Req): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body as Record<string, unknown>);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch (err) {
        reject(err);
      }
    });
  });
}

export function sendError(res: Res, err: unknown) {
  const status = (err as { status?: number }).status ?? 400;
  const message = err instanceof Error ? err.message : 'Request failed';
  console.error(message);
  res.status(status).json({ error: message });
}
