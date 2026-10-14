import { isAddress, type Address } from 'viem';
import { sendError } from './_lib/http.js';
import { cleanName, handleOfAddress, ownerOfName } from './_lib/names.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const handle = cleanName(url.searchParams.get('handle') || '');
    const address = url.searchParams.get('address') || '';
    if (handle) {
      const owner = await ownerOfName(handle);
      return res.status(200).json(owner ? { handle, address: owner } : {});
    }
    if (address && isAddress(address)) {
      const name = await handleOfAddress(address as Address);
      return res.status(200).json(name ? { handle: name, address } : {});
    }
    return res.status(200).json({});
  } catch (err) {
    sendError(res, err);
  }
}
