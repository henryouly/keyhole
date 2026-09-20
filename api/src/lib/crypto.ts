import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env.js";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

function key(): Buffer {
  const hex = env.DATA_ENCRYPTION_KEY.trim();
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes as hex (64 chars)");
  }
  return buf;
}

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext). */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const b64 = (b: Buffer) => b.toString("base64url");
  return `${b64(iv)}.${b64(tag)}.${b64(ct)}`;
}

export function decryptToken(blob: string): string {
  const [ivB64, tagB64, ctB64] = blob.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Malformed token blob");
  const decipher = createDecipheriv(
    ALGO,
    key(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return (
    decipher.update(Buffer.from(ctB64, "base64url")).toString("utf8") +
    decipher.final("utf8")
  );
}
