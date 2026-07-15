import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const proxy = await prisma.proxy.findUnique({ where: { id } });
  if (!proxy) {
    return NextResponse.json({ error: "Proxy not found" }, { status: 404 });
  }

  const result = await prisma.account.updateMany({
    data: { proxyId: id },
  });

  return NextResponse.json({
    ok: true,
    proxyId: id,
    updated: result.count,
  });
}
