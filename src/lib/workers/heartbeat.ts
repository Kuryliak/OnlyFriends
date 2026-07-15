import { prisma } from "@/lib/db";

export const WORKER_HEARTBEAT_PREFIX = "worker_heartbeat_";

export type WorkerHeartbeat = {
  workerId: string;
  at: string;
  configSummary: string;
};

export function getWorkerId(): string {
  return process.env.WORKER_ID ?? `worker-${process.pid}`;
}

export async function touchWorkerHeartbeat(configSummary: string): Promise<void> {
  const workerId = getWorkerId();
  const payload: WorkerHeartbeat = {
    workerId,
    at: new Date().toISOString(),
    configSummary,
  };

  await prisma.appSetting.upsert({
    where: { key: `${WORKER_HEARTBEAT_PREFIX}${workerId}` },
    create: { key: `${WORKER_HEARTBEAT_PREFIX}${workerId}`, value: JSON.stringify(payload) },
    update: { value: JSON.stringify(payload) },
  });
}

export async function listWorkerHeartbeats(maxAgeMs = 30_000): Promise<WorkerHeartbeat[]> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: WORKER_HEARTBEAT_PREFIX } },
  });

  const cutoff = Date.now() - maxAgeMs;
  const heartbeats: WorkerHeartbeat[] = [];

  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.value) as WorkerHeartbeat;
      const at = Date.parse(parsed.at);
      if (!Number.isFinite(at) || at < cutoff) continue;
      heartbeats.push(parsed);
    } catch {
      // skip malformed heartbeat
    }
  }

  return heartbeats.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}