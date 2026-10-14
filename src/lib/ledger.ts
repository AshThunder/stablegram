export type Kind = 'send' | 'tip' | 'request' | 'split' | 'collect' | 'circle' | 'tab';

export type ActivityItem = {
  id: string;
  kind: Kind;
  title: string;
  amount: number;
  who: string;
  direction: 'in' | 'out';
  status: 'pending' | 'confirmed';
  txHash?: string;
  due?: string;
  at: number;
};

export type Friend = { handle: string; address?: string };

type Ledger = {
  handle: string;
  friends: Friend[];
  activity: ActivityItem[];
};

const KEY = 'stablegram.ledger';

function blank(): Ledger {
  return { handle: '', friends: [], activity: [] };
}

export function readLedger(): Ledger {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    return { ...blank(), ...JSON.parse(raw) };
  } catch {
    return blank();
  }
}

export function writeLedger(next: Ledger) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function claimHandle(handle: string) {
  const ledger = readLedger();
  ledger.handle = handle.replace(/^@/, '').toLowerCase();
  writeLedger(ledger);
  return ledger.handle;
}

export function forgetHandle() {
  const ledger = readLedger();
  if (!ledger.handle) return;
  ledger.handle = '';
  writeLedger(ledger);
}

export function addFriend(handle: string, address?: string) {
  const ledger = readLedger();
  const clean = handle.replace(/^@/, '').toLowerCase();
  const existing = ledger.friends.find((f) => f.handle === clean);
  if (existing) {
    if (address) existing.address = address;
  } else {
    ledger.friends.unshift({ handle: clean, address });
  }
  writeLedger(ledger);
  window.dispatchEvent(new Event('dg-ledger'));
  return ledger.friends;
}

export function removeFriend(handle: string) {
  const ledger = readLedger();
  const clean = handle.replace(/^@/, '').toLowerCase();
  ledger.friends = ledger.friends.filter((f) => f.handle !== clean);
  writeLedger(ledger);
  window.dispatchEvent(new Event('dg-ledger'));
  return ledger.friends;
}

export function pushActivity(item: Omit<ActivityItem, 'id' | 'at'> & { id?: string }) {
  const ledger = readLedger();
  const id = item.id ?? `act-${Date.now()}`;
  const row: ActivityItem = { ...item, id, at: Date.now() };
  const existing = ledger.activity.findIndex((a) => a.id === id);
  if (existing >= 0) ledger.activity[existing] = { ...ledger.activity[existing], ...row };
  else ledger.activity.unshift(row);
  writeLedger(ledger);
  window.dispatchEvent(new Event('dg-ledger'));
  return row;
}

export function patchActivity(id: string, patch: Partial<ActivityItem>) {
  const ledger = readLedger();
  ledger.activity = ledger.activity.map((a) => (a.id === id ? { ...a, ...patch } : a));
  writeLedger(ledger);
}
