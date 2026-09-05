import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export type SentinelUser = {
  userId: string;
  displayName: string;
  email: string;
  walletAddress: string | null;
};

const COOKIE = 'sentinel-session';

function secret() {
  const value = process.env.SENTINEL_SESSION_SECRET || process.env.PRIVY_APP_SECRET;
  if (!value) throw new Error('SENTINEL session secret is not configured.');
  return value;
}

function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

async function signature(payload: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return encode(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))));
}

export async function createSessionValue(user: SentinelUser) {
  const payload = encode(new TextEncoder().encode(JSON.stringify({ ...user, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })));
  return `${payload}.${await signature(payload)}`;
}

export async function getSentinelUser(): Promise<SentinelUser | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  const [payload, supplied] = value.split('.');
  if (!payload || !supplied || await signature(payload) !== supplied) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decode(payload))) as SentinelUser & { exp: number };
    if (!parsed.userId || parsed.exp < Date.now()) return null;
    return { userId: parsed.userId, displayName: parsed.displayName, email: parsed.email, walletAddress: parsed.walletAddress };
  } catch { return null; }
}

export async function requireSentinelUser(returnTo = '/dashboard') {
  const user = await getSentinelUser();
  if (user) return user;
  redirect(`/?return_to=${encodeURIComponent(returnTo)}`);
}

export const sentinelSessionCookie = COOKIE;
