import { circleClient } from '../_lib/circle.js';
import { readJson, sendError } from '../_lib/http.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = await readJson(req);
    const response = await circleClient().createDeviceTokenForSocialLogin({
      deviceId: String(body.deviceId || ''),
    });
    res.status(200).json(response.data);
  } catch (err) {
    sendError(res, err);
  }
}
