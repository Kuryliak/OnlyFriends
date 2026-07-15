import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isTerminalBatchStatus, type OutreachBatchSummary } from "@/lib/outreach/batch";

function parseSummary(json: string | null): OutreachBatchSummary | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as OutreachBatchSummary;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const terminalOnly = searchParams.get("terminal") === "1";
  const sinceParam = searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const batches = await prisma.outreachBatch.findMany({
    where: {
      updatedAt: { gte: since },
      ...(terminalOnly ? { status: { not: "RUNNING" } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return NextResponse.json(
    batches.map((batch) => ({
      id: batch.id,
      status: batch.status,
      targetCount: batch.targetCount,
      accountCount: batch.accountCount,
      summary: parseSummary(batch.summaryJson),
      createdAt: batch.createdAt.toISOString(),
      completedAt: batch.completedAt?.toISOString() ?? null,
      updatedAt: batch.updatedAt.toISOString(),
      terminal: isTerminalBatchStatus(batch.status),
    }))
  );
}