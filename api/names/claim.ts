import { isAddress, type Address, type Hex } from 'viem';
import { readJson, sendError } from '../_lib/http.js';
import { cleanName, submitClaim, validName, walletOwns } from '../_lib/names.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = await readJson(req);
    const userToken = String(body.userToken || '');
    const address = String(body.address || '');
    const name = cleanName(String(body.name || ''));
    const signature = String(body.signature || '');
    if (!userToken || !isAddress(address) || !validName(name) || !signature.startsWith('0x')) {
      return res.status(400).json({ error: 'Name claim is missing a wallet or a signature.' });
    }
    if (!(await walletOwns(userToken, address))) {
      return res.status(403).json({ error: 'That wallet is not signed in.' });
    }
    const hash = await submitClaim(address as Address, name, signature as Hex);
    res.status(200).json({ hash });
  } catch (err) {
    sendError(res, err);
  }
}
