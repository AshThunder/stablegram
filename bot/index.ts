import { Bot, InlineKeyboard } from 'grammy';

const token = process.env.TELEGRAM_BOT_TOKEN;
const miniAppUrl = process.env.VITE_MINI_APP_URL;
const botUsername = process.env.VITE_BOT_USERNAME || 'stablegram_bot';

if (!token || !miniAppUrl) {
  console.error('Set TELEGRAM_BOT_TOKEN and VITE_MINI_APP_URL');
  process.exit(1);
}

const bot = new Bot(token);

bot.command('start', async (ctx) => {
  const keyboard = new InlineKeyboard().webApp('Open Stablegram', miniAppUrl);
  await ctx.replyWithPhoto(`${miniAppUrl.replace(/\/$/, '')}/stablegram-cover.jpg`, {
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
    reply_markup: keyboard,
  });
});

bot.catch((err) => console.error(err));
console.log(`@${botUsername} listening`);
bot.start();
