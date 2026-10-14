import { arcBlockchain, circleClient } from '../_lib/circle.js';
import { readJson, sendError } from '../_lib/http.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = await readJson(req);
    const userToken = String(body.userToken || '');
    const client = circleClient();
    try {
      const created = await client.createUserPinWithWallets({
        userToken,
        blockchains: [arcBlockchain()],
        accountType: 'EOA',
      });
      return res.status(200).json(created.data);
    } catch (err) {
      const code = (err as { code?: number; response?: { data?: { code?: number } } }).code
        ?? (err as { response?: { data?: { code?: number } } }).response?.data?.code;
      if (code === 155106) {
        const wallets = await client.listWallets({ userToken });
        return res.status(200).json({ code: 155106, wallets: wallets.data?.wallets ?? [] });
      }
      throw err;
    }
  } catch (err) {
    sendError(res, err);
  }
}
