import argon2 from 'argon2';
import { compare } from 'bcryptjs';

export const passwordHashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;
export const bcryptHashPattern = /^\$2[aby]\$(?:0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/;
export function isArgonPasswordHash(value: string): boolean {
  const match =
    /^\$argon2id\$v=19\$([mtp]=\d+(?:,[mtp]=\d+){2})\$[A-Za-z0-9+/]{16,}\$[A-Za-z0-9+/]{32,}$/.exec(
      value,
    );
  if (!match) return false;
  const parameters = new Map(
    match[1]!.split(',').map((pair) => {
      const [key, number] = pair.split('=');
      return [key!, Number(number)] as const;
    }),
  );
  const m = parameters.get('m') ?? 0,
    t = parameters.get('t') ?? 0,
    p = parameters.get('p') ?? 0;
  return (
    parameters.size === 3 &&
    [m, t, p].every((v) => Number.isSafeInteger(v) && v >= 1) &&
    m >= 8 * p &&
    m <= 262144 &&
    t <= 10 &&
    p <= 16
  );
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, passwordHashOptions);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (bcryptHashPattern.test(hash)) {
    // Nunca aceitar a truncagem silenciosa de bcrypt como igualdade de passwords distintas.
    if (Buffer.byteLength(password, 'utf8') > 72) return false;
    return compare(password, hash.startsWith('$2y$') ? '$2b$' + hash.slice(4) : hash);
  }
  if (isArgonPasswordHash(hash)) return argon2.verify(hash, password);
  return false;
}
