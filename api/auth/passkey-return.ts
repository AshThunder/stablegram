import { putPasskeyHandoff, takePasskeyHandoff } from '../_lib/passkeyHandoff.js';
import { readJson, sendError } from '../_lib/http.js';

const STATE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.\d{1,20}$/i;

function credentialOf(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const row = value as { id?: unknown; publicKey?: unknown; rpId?: unknown };
  const id = typeof row.id === 'string' ? row.id : '';
  const rawKey = typeof row.publicKey === 'string' ? row.publicKey : '';
  const publicKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`;
  const rpId = typeof row.rpId === 'string' ? row.rpId : '';
  if (id.length < 8 || id.length > 512 || !/^0x[0-9a-f]+$/i.test(publicKey) || publicKey.length > 400) return null;
  if (rpId && rpId.length > 200) return null;
  return { id, publicKey, rpId };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (typeof res.setHeader === 'function') res.setHeader('Cache-Control', 'no-store');
  try {
    const body = await readJson(req);
    const state = String(body.state || '');
    if (!STATE.test(state)) return res.status(400).json({ error: 'Passkey handoff was not recognized.' });
    const credential = credentialOf(body.credential);
    if (credential) {
      const name = String(body.name || '').trim().slice(0, 40);
      await putPasskeyHandoff(state, JSON.stringify({ credential, name }));
      return res.status(200).json({ ok: true });
    }
    const found = await takePasskeyHandoff(state);
    if (!found) return res.status(200).json({ pending: true });
    return res.status(200).json(JSON.parse(found) as { credential: { id: string; publicKey: string; rpId?: string }; name?: string });
  } catch (err) {
    sendError(res, err);
  }
}
