import { NextRequest, NextResponse } from "next/server";
import { refreshWorkerConfig } from "@/lib/jobs/worker-config";
import { kickJobProcessor } from "@/lib/jobs/trigger";
import {
  resolveWorkerSettings,
  setWorkerSettings,
  WORKER_SETTINGS_BOUNDS,
  type WorkerSettings,
} from "@/lib/settings/worker-settings";
import { z } from "zod";

const settingsSchema = z.object({
  concurrency: z.number().int().optional(),
  proxyConcurrency: z.number().int().optional(),
  outreachConcurrency: z.number().int().optional(),
  pollMs: z.number().int().optional(),
  startStaggerMs: z.number().int().optional(),
  staleJobMs: z.number().int().optional(),
});

export async function GET() {
  const resolved = await resolveWorkerSettings();
  return NextResponse.json({
    settings: resolved.settings,
    sources: resolved.sources,
    bounds: WORKER_SETTINGS_BOUNDS,
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const current = await resolveWorkerSettings();
  const merged: Partial<WorkerSettings> = {
    ...current.settings,
    ...parsed.data,
  };

  const settings = await setWorkerSettings(merged);
  await refreshWorkerConfig();
  kickJobProcessor();

  const resolved = await resolveWorkerSettings();
  return NextResponse.json({
    settings,
    sources: resolved.sources,
    bounds: WORKER_SETTINGS_BOUNDS,
  });
}

export async function DELETE() {
  const { prisma } = await import("@/lib/db");
  const { WORKER_SETTINGS_KEY } = await import("@/lib/settings/worker-settings");

  await prisma.appSetting.deleteMany({ where: { key: WORKER_SETTINGS_KEY } });
  await refreshWorkerConfig();
  kickJobProcessor();

  const resolved = await resolveWorkerSettings();
  return NextResponse.json({
    settings: resolved.settings,
    sources: resolved.sources,
    bounds: WORKER_SETTINGS_BOUNDS,
  });
}