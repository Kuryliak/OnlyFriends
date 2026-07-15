import { prisma } from "../src/lib/db";
import { readProxyFromEnv } from "../src/lib/proxy/env";
import { testProxy } from "../src/lib/proxy/test";

async function main() {
  const envProxy = readProxyFromEnv();
  const dbProxies = await prisma.proxy.findMany({ orderBy: { createdAt: "asc" } });

  if (!envProxy && !dbProxies.length) {
    console.log("No proxy configured.");
    console.log("Add PROXY_HOST + PROXY_PORT to .env, or create one on the Proxies page.");
    process.exit(1);
  }

  if (envProxy) {
    console.log(`\nTesting .env proxy: ${envProxy.type}://${envProxy.host}:${envProxy.port}`);
    const result = await testProxy({
      host: envProxy.host,
      port: envProxy.port,
      type: envProxy.type,
      username: envProxy.username ?? null,
      password: envProxy.password ?? null,
    });
    printResult(result);
  }

  for (const proxy of dbProxies) {
    console.log(`\nTesting DB proxy "${proxy.name}": ${proxy.type}://${proxy.host}:${proxy.port}`);
    const result = await testProxy(proxy);
    printResult(result);
  }
}

function printResult(
  result:
    | { ok: true; ip: string; elapsedMs: number; xvideosReachable: boolean; xvideosMs?: number }
    | { ok: false; error: string }
) {
  if (!result.ok) {
    console.log(`  FAIL: ${result.error}`);
    return;
  }

  console.log(`  OK — egress IP: ${result.ip} (${result.elapsedMs}ms)`);
  if (result.xvideosReachable) {
    console.log(`  XVIDEOS reachable (${result.xvideosMs ?? "?"}ms)`);
  } else {
    console.log("  WARN — proxy connects but XVIDEOS did not load (may still work with auth)");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());