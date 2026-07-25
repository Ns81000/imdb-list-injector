// Server-only auth helpers. Never imported by client-reachable modules.
// PBKDF2 with SHA-256 is native to the Cloudflare Workers Web Crypto runtime;
// bcryptjs works but is slow at 12 rounds — PBKDF2/100k iterations is standard
// and instant here.

const ITERATIONS = 100_000;
const KEYLEN = 32;

function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  // btoa exists in Workers
  return btoa(bin);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, hash: "SHA-256", iterations },
    key,
    KEYLEN * 8,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt.buffer as ArrayBuffer)}$${toB64(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [algo, iterStr, saltB64, hashB64] = stored.split("$");
    if (algo !== "pbkdf2") return false;
    const iterations = parseInt(iterStr, 10);
    const salt = fromB64(saltB64);
    const expected = fromB64(hashB64);
    const derivedBuf = await pbkdf2(password, salt, iterations);
    const derived = new Uint8Array(derivedBuf);
    if (derived.length !== expected.length) return false;
    // constant-time compare
    let diff = 0;
    for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE = "zo_session";

export function getSessionConfig() {
  const password = process.env.SESSION_SECRET;
  if (!password) throw new Error("SESSION_SECRET is not configured");
  return {
    password,
    name: SESSION_COOKIE,
    maxAge: 60 * 60 * 24 * 30, // 30 days
    cookie: {
      httpOnly: true,
      sameSite: "strict" as const,
      secure: true,
      path: "/",
    },
  };
}
