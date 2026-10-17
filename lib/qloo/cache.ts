import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Private server-side response cache. Allowed by the hackathon guide with no time
 * limit, but Qloo data must never reach a public repo: FileCache writes only under
 * `.qloo-cache/` (gitignored). Production uses Postgres from Phase 3.
 */
export interface QlooCache {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, body: unknown): Promise<void>;
}

export function cacheKey(path: string, query: string): string {
  return createHash("sha256").update(`${path}?${query}`).digest("hex");
}

export class MemoryCache implements QlooCache {
  private readonly store = new Map<string, unknown>();
  async get(key: string) {
    return this.store.get(key);
  }
  async set(key: string, body: unknown) {
    this.store.set(key, body);
  }
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** CLI-only disk cache. One JSON file per request key. */
export class FileCache implements QlooCache {
  constructor(
    private readonly dir = join(process.cwd(), ".qloo-cache"),
    private readonly ttlMs = SEVEN_DAYS_MS,
  ) {}

  async get(key: string) {
    try {
      const raw = JSON.parse(await readFile(join(this.dir, `${key}.json`), "utf8")) as { at: number; body: unknown };
      return Date.now() - raw.at <= this.ttlMs ? raw.body : undefined;
    } catch {
      return undefined;
    }
  }

  async set(key: string, body: unknown) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${key}.json`), JSON.stringify({ at: Date.now(), body }));
  }
}
