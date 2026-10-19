/**
 * Public run ids: 12 base62 characters from crypto randomness (about 71 bits), so ids
 * are unguessable and carry no order or count. The same id is the report permalink.
 */
import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const LENGTH = 12;

export const RUN_ID_RE = /^[0-9A-Za-z]{12}$/;

export function newRunId(): string {
  let id = "";
  while (id.length < LENGTH) {
    for (const byte of randomBytes(16)) {
      // 248 = 4 × 62: reject the tail so every character is equally likely.
      if (byte < 248 && id.length < LENGTH) id += ALPHABET[byte % 62];
    }
  }
  return id;
}

export function isRunId(value: string): boolean {
  return RUN_ID_RE.test(value);
}
