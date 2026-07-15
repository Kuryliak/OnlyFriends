import { prisma } from "@/lib/db";
import type { Proxy, ProxyType } from "@prisma/client";

export type EnvProxyConfig = {
  name: string;
  host: string;
  port: number;
  type: ProxyType;
  username?: string;
  password?: string;
  country?: string;
};

export function readProxyFromEnv(): EnvProxyConfig | null {
  const host = process.env.PROXY_HOST?.trim();
  const portRaw = process.env.PROXY_PORT?.trim();
  if (!host || !portRaw) return null;

  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) return null;

  const type = (process.env.PROXY_TYPE?.toUpperCase() ?? "HTTP") as ProxyType;
  if (!["HTTP", "HTTPS", "SOCKS5"].includes(type)) return null;

  return {
    name: process.env.PROXY_NAME?.trim() || "Default proxy",
    host,
    port,
    type,
    username: process.env.PROXY_USERNAME?.trim() || undefined,
    password: process.env.PROXY_PASSWORD?.trim() || undefined,
    country: process.env.PROXY_COUNTRY?.trim() || undefined,
  };
}

export async function ensureEnvProxy(): Promise<Proxy | null> {
  const config = readProxyFromEnv();
  if (!config) return null;

  const existing = await prisma.proxy.findFirst({
    where: { host: config.host, port: config.port },
  });

  if (existing) {
    return prisma.proxy.update({
      where: { id: existing.id },
      data: {
        name: config.name,
        type: config.type,
        username: config.username ?? null,
        password: config.password ?? null,
        country: config.country ?? null,
        isActive: true,
      },
    });
  }

  return prisma.proxy.create({ data: { ...config, isActive: true } });
}

export async function getDefaultProxy(): Promise<Proxy | null> {
  await ensureEnvProxy();
  return prisma.proxy.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
}