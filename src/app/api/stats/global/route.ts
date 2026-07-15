import { NextRequest, NextResponse } from "next/server";
import { buildGlobalStats } from "@/lib/stats/global";
import { parseStatsRange } from "@/lib/stats/range";

export async function GET(req: NextRequest) {
  const range = parseStatsRange(new URL(req.url).searchParams.get("range"));
  const stats = await buildGlobalStats(range);
  return NextResponse.json(stats);
}