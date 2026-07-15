import { NextRequest, NextResponse } from "next/server";
import {
  refreshStealthConfig,
  resolveStealthSettings,
  saveStealthSettings,
} from "@/lib/settings/stealth";
import type { StealthSettings } from "@/lib/settings/stealth-shared";
import { kickJobProcessor } from "@/lib/jobs/trigger";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  enabled: z.boolean(),
});

export async function GET() {
  const [settings, activeProxies, accountsWithoutProxy] = await Promise.all([
    resolveStealthSettings(),
    prisma.proxy.count({ where: { isActive: true } }),
    prisma.account.count({ where: { proxyId: null } }),
  ]);

  return NextResponse.json({
    settings,
    activeProxies,
    accountsWithoutProxy,
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const current = await resolveStealthSettings();
  const merged: StealthSettings = { ...current, ...parsed.data };
  const settings = await saveStealthSettings(merged);
  await refreshStealthConfig();
  kickJobProcessor();

  const [activeProxies, accountsWithoutProxy] = await Promise.all([
    prisma.proxy.count({ where: { isActive: true } }),
    prisma.account.count({ where: { proxyId: null } }),
  ]);

  return NextResponse.json({ settings, activeProxies, accountsWithoutProxy });
}