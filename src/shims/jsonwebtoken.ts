/** Browser stand-in for jsonwebtoken.decode. The Circle web SDK only decodes the Google id token. */
export function decode(token: string | null | undefined): Record<string, unknown> | null {
  if (!token || !token.includes('.')) return null;
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default { decode };
