import { z } from "zod";

/** The only Qloo host hackathon keys work against (QLOO_RESEARCH.md §1). */
export const QLOO_HACKATHON_HOST = "https://hackathon.api.qloo.com";

/** $0 AI Gateway model chosen for Phase 2; override with SONDO_MODEL. */
export const DEFAULT_MODEL = "nvidia/nemotron-3.5-lightning-free";

const optionalSecret = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/** Numeric env var where an empty string means "unset" (coerce would turn it into 0). */
const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.coerce.number().pipe(schema).optional());

/**
 * Server-side environment. Every integration is optional in Phase 1 so the shell
 * runs with no credentials; callers that need one use `requireEnv()`.
 */
export const ServerEnvSchema = z.object({
  QLOO_API_KEY: optionalSecret,
  QLOO_BASE_URL: z
    .string()
    .trim()
    .default(QLOO_HACKATHON_HOST)
    .transform((v) => v.replace(/\/+$/, ""))
    .refine((v) => v === QLOO_HACKATHON_HOST, {
      message: `QLOO_BASE_URL must be ${QLOO_HACKATHON_HOST} (hackathon keys fail on other hosts)`,
    }),
  AI_GATEWAY_API_KEY: optionalSecret,
  DATABASE_URL: optionalSecret.pipe(z.url({ protocol: /^postgres(ql)?$/ }).optional()),
  /** AI Gateway model id ("provider/model"). Default is a $0 model (user decision, Phase 2). */
  SONDO_MODEL: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().regex(/^[a-z0-9-]+\/[\w.-]+$/i, "expected provider/model").default(DEFAULT_MODEL)),
  /** App-side estimate cap per agent run. Not a billing cap — set a budget on the gateway key too. */
  SONDO_RUN_COST_LIMIT_USD: optionalNumber(z.number().min(0).max(5)).transform((v) => v ?? 0.15),
  /** Optional USD per million tokens, for models the built-in price table doesn't know. */
  SONDO_MODEL_INPUT_USD_PER_MTOK: optionalNumber(z.number().min(0)),
  SONDO_MODEL_OUTPUT_USD_PER_MTOK: optionalNumber(z.number().min(0)),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = ServerEnvSchema.safeParse(source);
  if (!result.success) {
    // Report variable names only — never values.
    const fields = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment — ${fields}`);
  }
  return result.data;
}
