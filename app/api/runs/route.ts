import { postRunHandler } from "@/lib/runs/handlers";
import { runsApiDeps, serverLog } from "@/lib/runs/server";

// A run is ≤ 180 s (hard deadline) plus persistence; the function must outlive it.
export const maxDuration = 300;

export async function POST(req: Request) {
  let deps;
  try {
    deps = runsApiDeps();
  } catch (err) {
    serverLog({ event: "runs_unconfigured", reason: err instanceof Error ? err.message : "error" });
    return Response.json({ error: "unavailable", message: "Live research isn't available right now. Featured reports are still open." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  return postRunHandler(req, deps);
}
