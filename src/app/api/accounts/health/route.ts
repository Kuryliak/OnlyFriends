import { NextResponse } from "next/server";
import { runBanMonitor } from "@/lib/accounts/ban-monitor";

export async function GET() {
  const report = await runBanMonitor();
  return NextResponse.json(report);
}