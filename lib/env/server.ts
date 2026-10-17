import "server-only";

import { parseServerEnv, type ServerEnv } from "./schema";

let cached: ServerEnv | undefined;

/** Parsed lazily so a page that never touches an integration never validates it. */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

type RequiredKey = "QLOO_API_KEY" | "AI_GATEWAY_API_KEY" | "DATABASE_URL";

/** For integrations that cannot run without a credential (Phase 1b onward). */
export function requireEnv<K extends RequiredKey>(key: K): NonNullable<ServerEnv[K]> {
  const value = serverEnv()[key];
  if (value === undefined) {
    throw new Error(`${key} is not configured`);
  }
  return value as NonNullable<ServerEnv[K]>;
}
