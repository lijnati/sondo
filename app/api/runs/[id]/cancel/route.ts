import { cancelRunHandler } from "@/lib/runs/handlers";
import { runsApiDeps, serverLog } from "@/lib/runs/server";

export async function POST(_req: Request, ctx: RouteContext<"/api/runs/[id]/cancel">) {
  const { id } = await ctx.params;
  try {
    return await cancelRunHandler(id, runsApiDeps());
  } catch (err) {
    serverLog({ event: "run_cancel_failed", error: err instanceof Error ? err.name : "error" });
    return Response.json({ error: "unavailable", message: "Couldn't cancel this run right now." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
