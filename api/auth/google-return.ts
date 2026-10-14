import { putLoginHandoff, takeLoginHandoff } from '../_lib/loginHandoff.js';
import { readJson, sendError } from '../_lib/http.js';

const STATE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.\d{1,20}$/i;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (typeof res.setHeader === 'function') res.setHeader('Cache-Control', 'no-store');
  try {
    const body = await readJson(req);
    const state = String(body.state || '');
    if (!STATE.test(state)) return res.status(400).json({ error: 'Google did not return a usable sign-in.' });
    const idToken = typeof body.idToken === 'string' ? body.idToken : '';
    if (idToken) {
      if (idToken.length > 8000 || idToken.split('.').length !== 3) {
        return res.status(400).json({ error: 'Google did not return a usable sign-in.' });
      }
      await putLoginHandoff(state, idToken);
      return res.status(200).json({ ok: true });
    }
    const found = await takeLoginHandoff(state);
    if (!found) return res.status(200).json({ pending: true });
    return res.status(200).json({ idToken: found });
  } catch (err) {
    sendError(res, err);
  }
}
