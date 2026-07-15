"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Users,
  ListTodo,
  UserPlus,
  Bell,
  Target,
  XCircle,
  BarChart3,
  RefreshCw,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageShell } from "@/components/page-shell";
import { useI18n } from "@/lib/i18n/context";
import { cn, formatDate } from "@/lib/utils";
import { STATS_RANGES, parseStatsRange, type StatsRange } from "@/lib/stats/range";

type OutreachPeriod = {
  friends: number;
  subscribes: number;
  failed: number;
  skipped: number;
  unique: number;
};

type GlobalStats = {
  range: StatsRange;
  generatedAt: string;
  accounts: {
    total: number;
    byStatus: Record<string, number>;
    active: number;
    emailVerified: number;
    inGroup: number;
    withoutGroup: number;
    mutualFriendsTotal: number;
    friendRequestsTotal: number;
  };
  groups: { total: number };
  claims: Record<string, number>;
  actions: Record<string, number>;
  jobs: {
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  };
  outreach: {
    period: OutreachPeriod;
    chartGranularity: "hour" | "day";
    daily: Array<{ date: string; friends: number; subscribes: number; failed: number }>;
    topAccounts: Array<{
      accountId: string;
      username: string;
      status: string;
      friends: number;
      follows: number;
      total: number;
    }>;
    topMutual: Array<{
      id: string;
      username: string;
      mutualFriendsCount: number;
      friendRequestsSentCount: number;
      status: string;
    }>;
    topFailures: Array<{
      accountId: string;
      username: string;
      status: string;
      failures: number;
    }>;
    recentFailures: Array<{
      id: string;
      accountId: string;
      username: string;
      targetUser: string;
      errorMessage: string | null;
      createdAt: string;
    }>;
    topErrors: Array<{ message: string; count: number }>;
  };
  batches: {
    total: number;
    byStatus: Record<string, number>;
    recent: Array<{
      id: string;
      status: string;
      targetCount: number;
      accountCount: number;
      createdAt: string;
      completedAt: string | null;
      summary: unknown;
    }>;
  };
};

const RANGE_LABEL_KEYS: Record<StatsRange, string> = {
  "24h": "statsGlobal.window24h",
  "7d": "statsGlobal.window7d",
  "30d": "statsGlobal.window30d",
  all: "statsGlobal.windowAll",
};

function MetricTile({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/70 bg-surface-overlay/30 px-4 py-3", className)}>
      <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="font-display text-2xl font-semibold tabular-nums mt-1">{value}</p>
      {sub ? <p className="text-[11px] text-text-muted mt-0.5">{sub}</p> : null}
    </div>
  );
}

function BreakdownBar({
  items,
}: {
  items: Array<{ key: string; label: string; value: number; color: string }>;
}) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;

  return (
    <div className="space-y-3">
      <div className="h-2.5 rounded-full overflow-hidden flex bg-surface-overlay">
        {items.map((item) =>
          item.value > 0 ? (
            <div
              key={item.key}
              className={cn("h-full transition-all", item.color)}
              style={{ width: `${(item.value / total) * 100}%` }}
              title={`${item.label}: ${item.value}`}
            />
          ) : null
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-2 text-xs">
            <span className={cn("w-2 h-2 rounded-full shrink-0", item.color)} />
            <span className="text-text-secondary truncate">{item.label}</span>
            <span className="ml-auto tabular-nums font-medium">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityChart({
  data,
  granularity,
  labels,
}: {
  data: GlobalStats["outreach"]["daily"];
  granularity: "hour" | "day";
  labels: { friends: string; subscribes: string; failed: string };
}) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.friends, d.subscribes, d.failed)));

  return (
    <div className="flex items-end gap-1 h-36 pt-2 overflow-x-auto">
      {data.map((point) => {
        const fh = Math.round((point.friends / max) * 100);
        const sh = Math.round((point.subscribes / max) * 100);
        const eh = Math.round((point.failed / max) * 100);
        const label =
          granularity === "hour"
            ? `${point.date.slice(11, 13)}:00`
            : point.date.slice(5);

        return (
          <div key={point.date} className="flex-1 min-w-[1.25rem] flex flex-col items-center gap-1">
            <div className="w-full flex items-end justify-center gap-0.5 h-28">
              <div
                className="w-1.5 rounded-t bg-accent/80"
                style={{ height: `${Math.max(fh, point.friends ? 4 : 0)}%` }}
                title={`${labels.friends}: ${point.friends}`}
              />
              <div
                className="w-1.5 rounded-t bg-status-active/80"
                style={{ height: `${Math.max(sh, point.subscribes ? 4 : 0)}%` }}
                title={`${labels.subscribes}: ${point.subscribes}`}
              />
              <div
                className="w-1.5 rounded-t bg-status-error/70"
                style={{ height: `${Math.max(eh, point.failed ? 4 : 0)}%` }}
                title={`${labels.failed}: ${point.failed}`}
              />
            </div>
            <span className="text-[9px] text-text-muted font-mono whitespace-nowrap">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatsPageContent() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [range, setRange] = useState<StatsRange>(() =>
    parseStatsRange(searchParams.get("range"))
  );
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setRange(parseStatsRange(searchParams.get("range")));
  }, [searchParams]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/stats/global?range=${range}`)
      .then((r) => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const selectRange = (next: StatsRange) => {
    setRange(next);
    router.replace(`/stats?range=${next}`, { scroll: false });
  };

  const accountStatusItems = stats
    ? [
        { key: "ACTIVE", label: t("status.ACTIVE"), value: stats.accounts.byStatus.ACTIVE ?? 0, color: "bg-status-active" },
        { key: "IDLE", label: t("status.IDLE"), value: stats.accounts.byStatus.IDLE ?? 0, color: "bg-status-idle" },
        { key: "CAPTCHA", label: t("status.CAPTCHA"), value: stats.accounts.byStatus.CAPTCHA ?? 0, color: "bg-status-pending" },
        { key: "ERROR", label: t("status.ERROR"), value: stats.accounts.byStatus.ERROR ?? 0, color: "bg-status-error" },
        { key: "BANNED", label: t("status.BANNED"), value: stats.accounts.byStatus.BANNED ?? 0, color: "bg-status-error/70" },
      ]
    : [];

  const period = stats?.outreach.period;
  const chartTitleKey =
    stats?.outreach.chartGranularity === "hour"
      ? "statsGlobal.chart24h"
      : stats?.range === "all"
        ? "statsGlobal.chart14d"
        : stats?.range === "30d"
          ? "statsGlobal.chart30d"
          : "statsGlobal.chart7d";

  return (
    <PageShell size="2xl">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <BarChart3 size={22} className="text-accent" />
            {t("statsGlobal.title")}
          </span>
        }
        subtitle={
          <>
            {t("statsGlobal.subtitle")}
            {stats?.generatedAt ? (
              <span className="block text-[11px] text-text-muted mt-2 font-mono">
                {t("statsGlobal.updated")} {formatDate(stats.generatedAt, locale)}
              </span>
            ) : null}
          </>
        }
        className="mb-6"
        actions={
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {t("common.refresh")}
          </Button>
        }
      />

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <span className="text-xs text-text-muted">{t("statsGlobal.rangeLabel")}</span>
        <div className="flex flex-wrap gap-2">
          {STATS_RANGES.map((value) => (
            <Chip key={value} active={range === value} onClick={() => selectRange(value)}>
              {t(RANGE_LABEL_KEYS[value])}
            </Chip>
          ))}
        </div>
        <span className="text-xs text-text-secondary ml-auto">
          {t("statsGlobal.rangeActive", { period: t(RANGE_LABEL_KEYS[range]) })}
        </span>
      </div>

      {!stats && loading ? (
        <p className="text-sm text-text-muted">{t("common.loading")}</p>
      ) : null}

      {stats && (
        <div className="space-y-6">
          <section>
            <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
              <Users size={16} className="text-accent" />
              {t("statsGlobal.sectionAccounts")}
              <span className="text-xs font-normal text-text-muted">{t("statsGlobal.alwaysAllTime")}</span>
            </h2>
            <Card className="p-5 space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <MetricTile label={t("statsGlobal.totalAccounts")} value={stats.accounts.total} />
                <MetricTile label={t("statsGlobal.activeAccounts")} value={stats.accounts.active} />
                <MetricTile label={t("statsGlobal.emailVerified")} value={stats.accounts.emailVerified} />
                <MetricTile label={t("statsGlobal.inGroups")} value={stats.accounts.inGroup} sub={t("statsGlobal.groupsTotal", { count: stats.groups.total })} />
                <MetricTile label={t("statsGlobal.mutualFriends")} value={stats.accounts.mutualFriendsTotal} sub={t("statsGlobal.friendRequests", { count: stats.accounts.friendRequestsTotal })} />
              </div>
              <BreakdownBar items={accountStatusItems} />
            </Card>
          </section>

          <section>
            <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
              <Target size={16} className="text-accent" />
              {t("statsGlobal.sectionOutreach")}
            </h2>
            <Card className="overflow-hidden">
              {period && (
                <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 border-b border-border-subtle/70 bg-surface-overlay/15">
                  <MetricTile label={t("dashboard.statFriendsAdded")} value={period.friends} />
                  <MetricTile label={t("dashboard.statFollowsSent")} value={period.subscribes} />
                  <MetricTile label={t("dashboard.statUniqueTargets")} value={period.unique} />
                  <MetricTile label={t("dashboard.statFailed")} value={period.failed} />
                  <MetricTile label={t("dashboard.statSkipped")} value={period.skipped} />
                </div>
              )}
              <div className="px-5 py-4 bg-surface-overlay/20">
                <p className="text-xs text-text-muted mb-3">{t(chartTitleKey)}</p>
                <ActivityChart
                  data={stats.outreach.daily}
                  granularity={stats.outreach.chartGranularity}
                  labels={{
                    friends: t("dashboard.statFriendsAdded"),
                    subscribes: t("dashboard.statFollowsSent"),
                    failed: t("dashboard.statFailed"),
                  }}
                />
                <div className="flex flex-wrap gap-4 mt-3 text-[11px] text-text-muted">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent/80" />{t("dashboard.statFriendsAdded")}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-status-active/80" />{t("dashboard.statFollowsSent")}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-status-error/70" />{t("dashboard.statFailed")}</span>
                </div>
              </div>
            </Card>
          </section>

          <section>
            <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
              <ListTodo size={16} className="text-accent" />
              {t("statsGlobal.sectionJobs")}
            </h2>
            <Card className="p-5 space-y-4">
              <div>
                <p className="text-xs text-text-muted mb-2">{t("statsGlobal.jobsByStatus")}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.jobs.byStatus).map(([status, count]) => (
                    <span key={status} className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs">
                      <Badge status={status} />
                      <span className="tabular-nums font-medium">{count}</span>
                    </span>
                  ))}
                  {!Object.keys(stats.jobs.byStatus).length && (
                    <span className="text-sm text-text-muted">{t("statsGlobal.noDataInPeriod")}</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-2">{t("statsGlobal.jobsByType")}</p>
                <div className="ui-list rounded-xl border border-border/70 overflow-hidden">
                  {Object.entries(stats.jobs.byType)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <div key={type} className="ui-list-item flex items-center justify-between text-sm">
                        <span className="font-mono text-xs">
                          {t(`jobType.${type}`) !== `jobType.${type}` ? t(`jobType.${type}`) : type}
                        </span>
                        <span className="tabular-nums font-medium">{count}</span>
                      </div>
                    ))}
                  {!Object.keys(stats.jobs.byType).length && (
                    <p className="ui-list-empty">{t("statsGlobal.noDataInPeriod")}</p>
                  )}
                </div>
              </div>
            </Card>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section>
              <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
                <Layers size={16} className="text-accent" />
                {t("statsGlobal.sectionClaims")}
              </h2>
              <Card className="p-5">
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(stats.claims).map(([status, count]) => (
                    <MetricTile key={status} label={status} value={count} />
                  ))}
                </div>
                {!Object.keys(stats.claims).length && (
                  <p className="text-sm text-text-muted mt-3">{t("statsGlobal.noDataInPeriod")}</p>
                )}
                <p className="text-[11px] text-text-muted mt-4">{t("statsGlobal.claimsHint")}</p>
              </Card>
            </section>

            <section>
              <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
                <UserPlus size={16} className="text-accent" />
                {t("statsGlobal.sectionActions")}
              </h2>
              <Card className="p-5">
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(stats.actions).map(([status, count]) => (
                    <MetricTile key={status} label={status} value={count} />
                  ))}
                </div>
                {!Object.keys(stats.actions).length && (
                  <p className="text-sm text-text-muted mt-3">{t("statsGlobal.noDataInPeriod")}</p>
                )}
              </Card>
            </section>
          </div>

          <section>
            <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
              <Bell size={16} className="text-accent" />
              {t("statsGlobal.sectionBatches")}
            </h2>
            <Card>
              <div className="p-5 flex flex-wrap gap-2 border-b border-border-subtle/70">
                <MetricTile label={t("statsGlobal.batchesTotal")} value={stats.batches.total} className="min-w-[8rem]" />
                {Object.entries(stats.batches.byStatus).map(([status, count]) => (
                  <MetricTile key={status} label={status} value={count} className="min-w-[8rem]" />
                ))}
              </div>
              <div className="ui-list">
                {stats.batches.recent.map((batch) => (
                  <div key={batch.id} className="ui-list-item flex items-center justify-between gap-4 text-sm">
                    <div>
                      <p className="font-mono text-xs text-text-muted">{batch.id.slice(0, 10)}…</p>
                      <p className="text-text-secondary mt-0.5">
                        {t("statsGlobal.batchMeta", {
                          targets: batch.targetCount,
                          accounts: batch.accountCount,
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-text-muted">{formatDate(batch.createdAt, locale)}</span>
                      <Badge status={batch.status} />
                    </div>
                  </div>
                ))}
                {!stats.batches.recent.length && (
                  <p className="ui-list-empty">{t("statsGlobal.noBatches")}</p>
                )}
              </div>
            </Card>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <section className="xl:col-span-2">
              <h2 className="font-display text-sm font-semibold mb-3">{t("statsGlobal.topOutreach")}</h2>
              <Card>
                <div className="overflow-x-auto">
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th>{t("common.username")}</th>
                        <th>{t("dashboard.outreachFriends")}</th>
                        <th>{t("dashboard.outreachFollows")}</th>
                        <th>{t("dashboard.outreachTotal")}</th>
                        <th>{t("common.status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.outreach.topAccounts.map((row) => (
                        <tr key={row.accountId}>
                          <td className="font-medium">
                            <Link href={`/accounts/${row.accountId}`} className="hover:text-accent">
                              {row.username}
                            </Link>
                          </td>
                          <td className="tabular-nums">{row.friends}</td>
                          <td className="tabular-nums">{row.follows}</td>
                          <td className="tabular-nums font-medium">{row.total}</td>
                          <td><Badge status={row.status} /></td>
                        </tr>
                      ))}
                      {!stats.outreach.topAccounts.length && (
                        <tr>
                          <td colSpan={5} className="text-center text-text-muted py-8">
                            {t("statsGlobal.noDataInPeriod")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>

            <section>
              <h2 className="font-display text-sm font-semibold mb-3">{t("statsGlobal.topMutual")}</h2>
              <Card>
                <div className="ui-list">
                  {stats.outreach.topMutual.map((row) => (
                    <div key={row.id} className="ui-list-item flex items-center justify-between text-sm">
                      <Link href={`/accounts/${row.id}`} className="font-medium hover:text-accent truncate">
                        {row.username}
                      </Link>
                      <span className="tabular-nums text-text-secondary shrink-0">{row.mutualFriendsCount}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section>
              <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
                <XCircle size={16} className="text-status-error" />
                {t("statsGlobal.topFailures")}
              </h2>
              <Card>
                <div className="ui-list">
                  {stats.outreach.topFailures.map((row) => (
                    <div key={row.accountId} className="ui-list-item flex items-center justify-between text-sm">
                      <Link href={`/accounts/${row.accountId}`} className="hover:text-accent">
                        {row.username}
                      </Link>
                      <span className="tabular-nums text-status-error font-medium">{row.failures}</span>
                    </div>
                  ))}
                  {!stats.outreach.topFailures.length && (
                    <p className="ui-list-empty">{t("statsGlobal.noDataInPeriod")}</p>
                  )}
                </div>
              </Card>
            </section>

            <section>
              <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle size={16} className="text-status-pending" />
                {t("statsGlobal.topErrors")}
              </h2>
              <Card>
                <div className="ui-list">
                  {stats.outreach.topErrors.map((row) => (
                    <div key={row.message} className="ui-list-item text-sm">
                      <p className="text-text-secondary line-clamp-2">{row.message}</p>
                      <p className="text-xs text-text-muted mt-1 tabular-nums">×{row.count}</p>
                    </div>
                  ))}
                  {!stats.outreach.topErrors.length && (
                    <p className="ui-list-empty">{t("statsGlobal.noDataInPeriod")}</p>
                  )}
                </div>
              </Card>
            </section>
          </div>

          <section>
            <h2 className="font-display text-sm font-semibold mb-3">{t("statsGlobal.recentFailures")}</h2>
            <Card>
              <div className="ui-list">
                {stats.outreach.recentFailures.map((row) => (
                  <div key={row.id} className="ui-list-item text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/accounts/${row.accountId}`} className="font-medium hover:text-accent">
                        {row.username}
                      </Link>
                      <span className="text-xs text-text-muted">{formatDate(row.createdAt, locale)}</span>
                    </div>
                    <p className="text-xs font-mono text-accent mt-1">@{row.targetUser}</p>
                    {row.errorMessage && (
                      <p className="text-xs text-status-error mt-1 line-clamp-2">{row.errorMessage}</p>
                    )}
                  </div>
                ))}
                {!stats.outreach.recentFailures.length && (
                  <p className="ui-list-empty">{t("statsGlobal.noDataInPeriod")}</p>
                )}
              </div>
            </Card>
          </section>
        </div>
      )}
    </PageShell>
  );
}

export default function StatsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-text-muted">…</div>}>
      <StatsPageContent />
    </Suspense>
  );
}