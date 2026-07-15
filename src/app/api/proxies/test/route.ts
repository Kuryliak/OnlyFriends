import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { testProxy } from "@/lib/proxy/test";
import { z } from "zod";

const schema = z.object({
  id: z.string().optional(),
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  type: z.enum(["HTTP", "HTTPS", "SOCKS5"]).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let proxy = null;

  if (parsed.data.id) {
    proxy = await prisma.proxy.findUnique({ where: { id: parsed.data.id } });
    if (!proxy) {
      return NextResponse.json({ error: "Proxy not found" }, { status: 404 });
    }
  } else if (parsed.data.host && parsed.data.port) {
    proxy = {
      host: parsed.data.host,
      port: parsed.data.port,
      type: parsed.data.type ?? "HTTP",
      username: parsed.data.username ?? null,
      password: parsed.data.password ?? null,
    };
  } else {
    return NextResponse.json({ error: "Provide proxy id or host+port" }, { status: 400 });
  }

  const result = await testProxy(proxy);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}