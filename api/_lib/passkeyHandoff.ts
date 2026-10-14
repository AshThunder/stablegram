const TTL_MS = 3 * 60 * 1000;
const memory = new Map<string, { value: string; expires: number }>();

function envValue(name: string) {
  const bag = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return bag?.[name] ?? '';
}

function cacheKey(state: string) {
  return `stablegram:passkey:${state}`;
}

async function cache() {
  const { getCache } = await import('@vercel/functions');
  return getCache();
}

export async function putPasskeyHandoff(state: string, value: string) {
  if (envValue('VERCEL') !== '1') {
    memory.set(state, { value, expires: Date.now() + TTL_MS });
    return;
  }
  await (await cache()).set(cacheKey(state), value, { ttl: 180, name: 'stablegram-passkey' });
}

export async function takePasskeyHandoff(state: string) {
  if (envValue('VERCEL') !== '1') {
    const row = memory.get(state);
    memory.delete(state);
    if (!row || row.expires < Date.now()) return null;
    return row.value;
  }
  const store = await cache();
  const value = await store.get(cacheKey(state));
  if (typeof value !== 'string') return null;
  await store.delete(cacheKey(state));
  return value;
}
