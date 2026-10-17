import { z } from "zod";

/** The only Qloo host hackathon keys work against (QLOO_RESEARCH.md §1). */
export const QLOO_HACKATHON_HOST = "https://hackathon.api.qloo.com";

const optionalSecret = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

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
