export type Intent =
  | { kind: 'send' | 'tip' | 'request'; amount: number; who: string }
  | { kind: 'split'; amount: number; who: string[] }
  | null;

function amountOf(text: string): number | null {
  const m = text.match(/\$?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return n > 0 ? n : null;
}

function handles(text: string) {
  return [...text.matchAll(/@([a-zA-Z0-9_]{2,})/g)].map((m) => m[1].toLowerCase());
}

export function parseIntent(input: string): Intent {
  const text = input.trim();
  const amount = amountOf(text);
  const who = handles(text);
  if (!amount || who.length === 0) return null;
  if (/^split\b/i.test(text) && who.length >= 1) return { kind: 'split', amount, who };
  if (/^tip\b/i.test(text)) return { kind: 'tip', amount, who: who[0] };
  if (/^request\b/i.test(text)) return { kind: 'request', amount, who: who[0] };
  if (/^(send|pay)\b/i.test(text)) return { kind: 'send', amount, who: who[0] };
  return { kind: 'send', amount, who: who[0] };
}
