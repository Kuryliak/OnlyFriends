import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { searchProfiles } from "@/lib/automation/tasks/profile-search";
import { z } from "zod";

const schema = z.object({
  accountId: z.string().optional(),
  keywords: z.string().optional(),
  sex: z.string().optional(),
  seeking: z.string().optional(),
  roleplay: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  relationship: z.string().optional(),
  ageMin: z.number().int().min(0).max(120).optional(),
  ageMax: z.number().int().min(0).max(120).optional(),
  createDate: z.number().int().optional(),
  kids: z.string().optional(),
  religion: z.string().optional(),
  smoking: z.string().optional(),
  drinking: z.string().optional(),
  webcam: z.string().optional(),
  hasPicture: z.boolean().optional(),
  hasVideo: z.boolean().optional(),
  isPornstar: z.boolean().optional(),
  verified: z.boolean().optional(),
  ethnicity: z.string().optional(),
  body: z.string().optional(),
  heightMin: z.number().int().optional(),
  heightMax: z.number().int().optional(),
  weightMin: z.number().int().optional(),
  weightMax: z.number().int().optional(),
  hairLength: z.string().optional(),
  hairColor: z.string().optional(),
  eyesColor: z.string().optional(),
  orderby: z.enum(["relevance", "hits", "votes", "last_activity"]).optional(),
  page: z.number().int().min(1).optional(),
  listMode: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let account = null;
  if (parsed.data.accountId) {
    account = await prisma.account.findUnique({
      where: { id: parsed.data.accountId },
      include: { proxy: true },
    });
  }

  const result = await searchProfiles(
    parsed.data,
    account,
    account?.proxy ?? null
  );

  if (!result.success) {
    return NextResponse.json(result, { status: result.captcha ? 429 : 502 });
  }

  return NextResponse.json(result);
}