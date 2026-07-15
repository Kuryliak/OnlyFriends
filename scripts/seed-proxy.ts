import { ensureEnvProxy, readProxyFromEnv } from "../src/lib/proxy/env";

async function main() {
  const config = readProxyFromEnv();
  if (!config) {
    console.error("Set PROXY_HOST and PROXY_PORT in .env first.");
    process.exit(1);
  }

  const proxy = await ensureEnvProxy();
  console.log("Proxy ready:", proxy?.name, `${proxy?.host}:${proxy?.port}`, `(${proxy?.type})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});