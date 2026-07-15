import { NextResponse } from "next/server";
import { getWorkerStatusPayload } from "@/lib/workers/status";

export async function GET() {
  const status = await getWorkerStatusPayload();
  return NextResponse.json(status);
}