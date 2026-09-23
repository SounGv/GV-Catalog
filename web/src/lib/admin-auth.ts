import { createHmac, timingSafeEqual } from "node:crypto";

/** Cookie that carries the signed admin session. Set by `signAdminSession`, checked by `middleware.ts`. */
export const ADMIN_SESSION_COOKIE = "gv_admin_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "ADMIN_SESSION_SECRET is not set. Add it to .env.local (any long random string) before using admin login.",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

/**
 * Builds a signed `payload.signature` session token for the given expiry timestamp.
 *
 * Why: the shared admin password has no per-user identity to look up server-side,
 * so the cookie itself must prove it was minted by this server (HMAC) and carry
 * its own expiry — nothing else validates it.
 */
export function createAdminSessionToken(expiresAtMs = Date.now() + SESSION_MAX_AGE_SECONDS * 1000): string {
  const payload = `admin.${expiresAtMs}`;
  return `${payload}.${sign(payload)}`;
}

export function adminSessionMaxAgeSeconds(): number {
  return SESSION_MAX_AGE_SECONDS;
}

/**
 * Verifies a session token's signature and expiry.
 *
 * Downstream (middleware, server actions) only needs a yes/no — it never reads
 * fields out of the token, so this returns a boolean rather than the payload.
 */
export function isValidAdminSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [scope, expiresAtRaw, signature] = parts;
  const payload = `${scope}.${expiresAtRaw}`;
  const expected = sign(payload);

  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  return scope === "admin";
}

/** Constant-time compare of the submitted login password against ADMIN_PASSWORD. */
export function isCorrectAdminPassword(submitted: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new Error("ADMIN_PASSWORD is not set. Add it to .env.local before using admin login.");
  }
  const submittedBuffer = Buffer.from(submitted);
  const expectedBuffer = Buffer.from(expected);
  if (submittedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(submittedBuffer, expectedBuffer);
}
