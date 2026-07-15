import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureEnvProxy } from "@/lib/proxy/env";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().positive(),
  type: z.enum(["HTTP", "HTTPS", "SOCKS5"]).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  country: z.string().optional(),
});

export async function GET() {
  await ensureEnvProxy();

  const proxies = await prisma.proxy.findMany({
    include: { _count: { select: { accounts: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(proxies);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const proxy = await prisma.proxy.create({ data: parsed.data });
  return NextResponse.json(proxy, { status: 201 });
}