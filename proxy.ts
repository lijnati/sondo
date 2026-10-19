import { NextResponse, type NextRequest } from "next/server";

import { neonDb } from "@/lib/db/neon";
import { runExists } from "@/lib/db/runs";
import { parseServerEnv } from "@/lib/env/schema";
import { isRunId } from "@/lib/runs/ids";

/**
 * Report permalinks: decide existence before the page starts streaming, so an unknown id
 * gets a real HTTP 404 (a notFound() inside a streamed page can only send 200). Unknown
 * and malformed ids are rewritten to /r/missing. If the database can't be reached, the
 * request passes through and the page shows its own error state.
 */
export async function proxy(req: NextRequest) {
  const id = req.nextUrl.pathname.split("/")[2] ?? "";
  if (id === "missing") return NextResponse.next();
  const missing = () => NextResponse.rewrite(new URL("/r/missing", req.url));
  if (!isRunId(id)) return missing();
  try {
    const url = parseServerEnv(process.env).DATABASE_URL;
    if (!url) return NextResponse.next();
    return (await runExists(neonDb(url), id)) ? NextResponse.next() : missing();
  } catch {
    return NextResponse.next();
  }
}

export const config = { matcher: "/r/:id" };
