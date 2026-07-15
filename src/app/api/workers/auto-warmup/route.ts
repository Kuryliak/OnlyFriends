import { NextRequest, NextResponse } from "next/server";
import {
  refreshAutoWarmupConfig,
  resolveAutoWarmupSettings,
  setAutoWarmupSettings,
} from "@/lib/settings/auto-warmup";
import type { AutoWarmupSettings } from "@/lib/settings/auto-warmup-shared";
import { AUTO_WARMUP_BOUNDS } from "@/lib/settings/auto-warmup-shared";
import { countAutoWarmupEligible } from "@/lib/jobs/idle-warmup";
import { kickJobProcessor } from "@/lib/jobs/trigger";
import { z } from "zod";

const schema = z.object({
  enabled: z.boolean().optional(),
  intervalMinutes: z.number().int().optional(),
  durationMinutes: z.number().int().optional(),
  maxPerCycle: z.number().int().optional(),
});

export async function GET() {
  const [settings, eligible] = await Promise.all([
    resolveAutoWarmupSettings(),
    countAutoWarmupEligible(),
  ]);

  return NextResponse.json({
    settings,
    bounds: AUTO_WARMUP_BOUNDS,
    eligibleNow: eligible,
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const current = await resolveAutoWarmupSettings();
  const merged: Partial<AutoWarmupSettings> = { ...current, ...parsed.data };
  const settings = await setAutoWarmupSettings(merged);
  await refreshAutoWarmupConfig();
  kickJobProcessor();

  const eligible = await countAutoWarmupEligible();
  return NextResponse.json({ settings, bounds: AUTO_WARMUP_BOUNDS, eligibleNow: eligible });
}