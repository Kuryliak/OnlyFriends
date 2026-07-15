import { banSecuritySummary } from "@/lib/automation/ban-security";
import { runWorkerCycle } from "@/lib/jobs/scheduler";
import { refreshAutoWarmupConfig } from "@/lib/settings/auto-warmup";
import { refreshStealthConfig } from "@/lib/settings/stealth";
import {
  refreshWorkerConfig,
  workerConfigSummary,
} from "@/lib/jobs/worker-config";

const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;

async function start() {
  const config = await refreshWorkerConfig();
  await refreshAutoWarmupConfig();
  await refreshStealthConfig();
  console.log(
    `[${workerId}] Starting (${workerConfigSummary(config)}, ${banSecuritySummary()}, poll ${config.pollMs}ms)`
  );
  loop();
}

async function loop() {
  try {
    await runWorkerCycle();
  } catch (err) {
    console.error(`[${workerId}] Error:`, err);
  }

  const config = await refreshWorkerConfig();
  await refreshAutoWarmupConfig();
  await refreshStealthConfig();
  setTimeout(loop, config.pollMs);
}

void start();