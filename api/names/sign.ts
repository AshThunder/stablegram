import { isAddress, type Address } from 'viem';
import { arcBlockchain, circleClient } from '../_lib/circle.js';
import { readJson, sendError } from '../_lib/http.js';
import { claimMessage, cleanName, namesChain, validName, walletOwns } from '../_lib/names.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = await readJson(req);
    const userToken = String(body.userToken || '');
    const address = String(body.address || '');
    const name = cleanName(String(body.name || ''));
    if (!userToken || !isAddress(address) || !validName(name)) {
      const reason = !userToken ? 'Sign in again before claiming.' : !isAddress(address) ? 'Your wallet address is not ready yet.' : 'Use 3 to 20 letters, numbers, or underscores.';
      return res.status(400).json({ error: reason });
    }
    if (!(await walletOwns(userToken, address))) {
      return res.status(403).json({ error: 'That wallet is not signed in.' });
    }
    const chain = namesChain();
    const message = claimMessage(chain.id, address as Address, name);
    const walletId = String(body.walletId || '');
    const response = await circleClient().signMessage({
      userToken,
      message,
      encodedByHex: false,
      memo: `Claim @${name} on Stablegram`,
      ...(walletId
        ? { walletId }
        : { walletAddress: address, blockchain: arcBlockchain() }),
    });
    const challengeId = response.data?.challengeId;
    if (!challengeId) return res.status(502).json({ error: 'Circle did not start the signature.' });
    res.status(200).json({ challengeId, message });
  } catch (err) {
    sendError(res, err);
  }
}
