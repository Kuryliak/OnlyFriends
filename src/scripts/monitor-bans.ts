import { runBanMonitor } from "@/lib/accounts/ban-monitor";

const INTERVAL_MS = Number(process.env.BAN_MONITOR_MS ?? 5 * 60 * 1000);

async function tick() {
  const report = await runBanMonitor();
  const summary = report.accounts
    .map((a) => `${a.username}:${a.banned ? "BANNED" : a.healthy ? "ok" : a.reason ?? "issue"}`)
    .join(", ");

  console.log(`[ban-monitor] ${report.checkedAt} — ${summary}`);

  if (report.newlyBanned.length) {
    console.log(`[ban-monitor] ⚠ NEWLY BANNED: ${report.newlyBanned.join(", ")}`);
  }
}

async function main() {
  console.log(`[ban-monitor] Watching accounts every ${INTERVAL_MS / 1000}s`);
  await tick();
  setInterval(() => {
    void tick().catch((err) => console.error("[ban-monitor] Error:", err));
  }, INTERVAL_MS);
}

void main();