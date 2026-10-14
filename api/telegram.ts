import { readJson } from './_lib/http.js';

function envValue(name: string) {
  const bag = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return bag?.[name] ?? '';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const token = envValue('TELEGRAM_BOT_TOKEN');
  const update = await readJson(req);
  const message = update.message as { chat?: { id?: number }; text?: string } | undefined;
  const chatId = message?.chat?.id;
  const text = message?.text || '';
  if (!token || !chatId || !text.startsWith('/start')) return res.status(200).json({ ok: true });
  const appUrl = (envValue('VITE_MINI_APP_URL') || `https://${envValue('VERCEL_PROJECT_PRODUCTION_URL') || envValue('VERCEL_URL')}`).replace(/\/$/, '');
  await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo: `${appUrl}/stablegram-cover.jpg`,
      caption: [
        'Stablegram pays friends in USDC without leaving Telegram.',
        'One balance. Fees on Arc are dollars.',
        '',
        'Google or a passkey opens a wallet on Arc. Claim one @name for it, and friends pay that name instead of a long address. You do not need USDC to claim the name.',
        '',
        'Send and tip move USDC. You approve each payment.',
        '',
        'Open the Mini App to start.',
      ].join('\n'),
      reply_markup: { inline_keyboard: [[{ text: 'Open Stablegram', web_app: { url: appUrl } }]] },
    }),
  });
  res.status(200).json({ ok: true });
}
