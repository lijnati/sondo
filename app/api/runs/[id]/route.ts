import { getRunHandler } from "@/lib/runs/handlers";
import { runsApiDeps, serverLog } from "@/lib/runs/server";

export async function GET(req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  try {
    return await getRunHandler(id, new URL(req.url), runsApiDeps());
  } catch (err) {
    serverLog({ event: "run_read_failed", error: err instanceof Error ? err.name : "error" });
    return Response.json({ error: "unavailable", message: "Couldn't load this run right now." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
