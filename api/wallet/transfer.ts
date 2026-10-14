import { arcBlockchain, circleClient, USDC } from '../_lib/circle.js';
import { readJson, sendError } from '../_lib/http.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = await readJson(req);
    const response = await circleClient().createTransaction({
      userToken: String(body.userToken || ''),
      walletId: String(body.walletId || ''),
      destinationAddress: String(body.destinationAddress || ''),
      amounts: [String(body.amount || '0')],
      blockchain: arcBlockchain(),
      tokenAddress: USDC,
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });
    res.status(200).json(response.data);
  } catch (err) {
    sendError(res, err);
  }
}
