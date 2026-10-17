/**
 * Quick compatibility check for an AI Gateway model: one structured-output call and one
 * tool-proposal call, the two capabilities the agent relies on. Costs whatever the model
 * costs (the default model is $0).
 *
 *   pnpm model:smoke [provider/model]
 */
import { generateText, Output, tool } from "ai";
import { z } from "zod";

import { parseServerEnv } from "@/lib/env/schema";

const env = parseServerEnv(process.env);
if (!env.AI_GATEWAY_API_KEY) {
  console.error("AI_GATEWAY_API_KEY is not set in .env.local; nothing was called.");
  process.exit(2);
}
const model = process.argv[2] ?? env.SONDO_MODEL;
const redact = (m: string) => m.split(env.AI_GATEWAY_API_KEY as string).join("<redacted>").slice(0, 300);
console.log(`model: ${model}`);

const t0 = Date.now();
try {
  const r = await generateText({
    model,
    maxRetries: 0,
    timeout: 60_000,
    maxOutputTokens: 1500,
    instructions: "Return JSON only.",
    prompt: "Name two music genres associated with trail running, each with a one-sentence reason.",
    output: Output.object({ schema: z.object({ genres: z.array(z.object({ name: z.string(), reason: z.string() })).min(2).max(2) }) }),
  });
  console.log(`structured output: OK in ${Date.now() - t0}ms`, JSON.stringify(r.output).slice(0, 160));
  console.log(`usage: in ${r.usage.inputTokens} / out ${r.usage.outputTokens}`);
} catch (e) {
  console.log(`structured output: FAILED (${(e as Error).name}) ${redact((e as Error).message)}`);
}

const t1 = Date.now();
try {
  const r = await generateText({
    model,
    maxRetries: 0,
    timeout: 60_000,
    maxOutputTokens: 1500,
    toolChoice: "required",
    instructions: "You direct research. Request follow-up research by calling tools.",
    prompt: "Weak category: podcast. Strong lead: E4 (an artist). Request up to two follow-ups.",
    tools: {
      exploreCategory: tool({ description: "Research another category", inputSchema: z.object({ category: z.enum(["podcast", "tv_show", "book"]), reason: z.string() }) }),
      bridge: tool({ description: "Use an evidence item as a seed in another category", inputSchema: z.object({ evidenceId: z.string().regex(/^E\d+$/), targetCategory: z.enum(["podcast", "brand"]), reason: z.string() }) }),
    },
  });
  console.log(`tool calls: OK in ${Date.now() - t1}ms`, JSON.stringify(r.toolCalls.map((c) => ({ tool: c.toolName, input: c.input }))).slice(0, 240));
} catch (e) {
  console.log(`tool calls: FAILED (${(e as Error).name}) ${redact((e as Error).message)}`);
}
