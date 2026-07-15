import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAccountProfileSlug } from "@/lib/automation/resolve-profile-slug";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const account = await prisma.account.findUnique({
    where: { id },
    include: { proxy: true },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const profileSlug = await resolveAccountProfileSlug(account, account.proxy);
  if (!profileSlug) {
    return NextResponse.json({ error: "Could not resolve XVIDEOS profile URL" }, { status: 404 });
  }

  const updated = await prisma.account.update({
    where: { id },
    data: { profileSlug },
  });

  return NextResponse.json({
    profileSlug: updated.profileSlug,
    profileUrl: `https://www.xvideos.com/profiles/${updated.profileSlug}`,
  });
}