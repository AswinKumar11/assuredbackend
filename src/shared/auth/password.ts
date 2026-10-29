import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing for ops users. scrypt from node:crypto rather than a native
 * bcrypt/argon2 addon: no build step, nothing extra to ship, and memory-hard.
 *
 * Stored format: `scrypt$N$r$p$<salt b64url>$<hash b64url>`. The parameters are
 * stored per hash, so they can be raised later without invalidating old ones.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;
const MAX_MEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LEN, { N: n, r, p, maxmem: MAX_MEM }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = await derive(
    password,
    Buffer.from(saltB64, 'base64url'),
    Number(n),
    Number(r),
    Number(p),
  );

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * A real hash of a throwaway password, computed once. Login verifies against it
 * when the email is unknown, so "no such user" and "wrong password" take the
 * same time and the endpoint cannot be used to enumerate ops emails.
 */
let dummyHash: Promise<string> | undefined;
export const dummyPasswordHash = (): Promise<string> =>
  (dummyHash ??= hashPassword(randomBytes(16).toString('hex')));
