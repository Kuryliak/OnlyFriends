"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  Globe,
  ListTodo,
  AlertTriangle,
  UserPlus,
  Bell,
  Target,
  XCircle,
  BarChart3,
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertBanner, PageHeader, PageShell } from "@/components/page-shell";
import { cn, formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import type { LucideIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

function DashboardCard({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("block group", className)}>
      <Card className="p-5 h-full transition-all duration-300 cursor-pointer group-hover:border-accent/35 group-hover:bg-surface-overlay/30 group-hover:shadow-card-hover group-focus-visible:outline-none group-focus-visible:ring-2 group-focus-visible:ring-accent/40">
        {children}
      </Card>
    </Link>
  );
}

function DashboardSectionCard({
  href,
  children,
  className,
  nestedLinks = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  nestedLinks?: boolean;
}) {
  const router = useRouter();

  if (nestedLinks) {
    return (
      <div
        role="link"
        tabIndex={0}
        onClick={() => router.push(href)}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(href);
          }
        }}
        className={cn("block", className)}
      >
        <Card
          className={cn(
            "transition-all duration-200 cursor-pointer",
            "hover:border-accent/40 focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/45"
          )}
        >
          {children}
        </Card>
      </div>
    );
  }

  return (
    <Link href={href} className={cn("block group", className)}>
      <Card
        className={cn(
          "transition-all duration-200 cursor-pointer",
          "group-hover:border-accent/40 group-focus-visible:outline-none group-focus-visible:ring-2 group-focus-visible:ring-accent/45"
        )}
      >
        {children}
      </Card>
    </Link>
  );
}

function StatCardContent({
  icon: Icon,
  value,
  label,
  sublabel,
}: {
  icon: LucideIcon;
  value: ReactNode;
  label: string;
  sublabel?: string;
}) {
  return (
    <>
      <div className="stat-icon-wrap mb-4">
        <Icon size={17} />
      </div>
      <p className="font-display text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="text-xs text-text-muted mt-1 group-hover:text-text-secondary transition-colors">
        {label}
      </p>
      {sublabel ? (
        <p className="text-[11px] text-text-muted/80 mt-0.5">{sublabel}</p>
      ) : null}
    </>
  );
}

interface Stats {
  accounts: number;
  activeAccounts: number;
  activeJobs: number;
  captchaAccounts: number;
  bannedAccounts: number;
  proxies: {
    active: number;
    accountsOnProxy: number;
    accountsWithoutProxy: number;
    outreachAccounts24h: number;
  };
  last24h: {
    friendsSent: number;
    friendsFailed: number;
    friendsSkipped: number;
    subscribesSent: number;
    subscribesFailed: number;
    uniqueTargets: number;
  };
  outreach: {
    friendsAdded: number;
    followsSent: number;
    uniqueTargets: number;
    friendsFailed: number;
    friendsSkipped: number;
    topAccounts: Array<{
      accountId: string;
      username: string;
      friends: number;
      follows: number;
      total: number;
    }>;
  };
  traffic?: {
    friendsLastHour: number;
    friendsLast24h: number;
    friendsPerHour: number;
    pendingFriendJobs: number;
    runningFriendJobs: number;
    activeAccounts: number;
    readyForOutreach: number;
    blockers: Array<{ key: string; label: string; count: number; href: string }>;
  };
  recentJobs: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string;
    account?: { username: string } | null;
  }>;
}

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);

  const fleetCards = stats
    ? [
        {
          key: "activeAccounts",
          href: "/accounts",
          icon: Users,
          value: stats.activeAccounts,
          label: t("dashboard.statActiveAccounts"),
          sublabel: t("dashboard.statAccountsTotal", { count: stats.accounts }),
        },
        {
          key: "friends24h",
          href: "/search",
          icon: UserPlus,
          value: stats.last24h.friendsSent,
          label: t("dashboard.statFriends24h"),
          sublabel: t("dashboard.statWindow24h"),
        },
        {
          key: "proxies",
          href: "/proxies",
          icon: Globe,
          value: stats.proxies.accountsOnProxy,
          label: t("dashboard.statAccountsOnProxy"),
          sublabel: t("dashboard.statActiveProxies", { count: stats.proxies.active }),
        },
        {
          key: "activeJobs",
          href: "/jobs",
          icon: ListTodo,
          value: stats.activeJobs,
          label: t("dashboard.statJobs"),
        },
      ]
    : [];

  const outreachCards = [
    {
      key: "subscribesSent" as const,
      label: t("dashboard.statFollowsSent"),
      icon: Bell,
      href: "/search",
    },
    {
      key: "uniqueTargets" as const,
      label: t("dashboard.statUniqueTargets"),
      icon: Target,
      href: "/search",
    },
    {
      key: "friendsFailed" as const,
      label: t("dashboard.statFailed"),
      icon: XCircle,
      href: "/issues?status=failed",
    },
    {
      key: "outreachOnProxy" as const,
      label: t("dashboard.statOutreachOnProxy24h"),
      icon: Globe,
      href: "/proxies",
    },
  ] as const;

  useEffect(() => {
    const load = () =>
      fetch("/api/stats")
        .then((r) => r.json())
        .then(setStats);
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <PageShell size="xl">
      <PageHeader
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        actions={
          <Link href="/stats?range=24h">
            <Button variant="secondary" size="sm">
              <BarChart3 size={14} />
              {t("dashboard.openFullStats")}
            </Button>
          </Link>
        }
      />

      {stats?.bannedAccounts ? (
        <AlertBanner
          href="/accounts"
          variant="error"
          icon={<XCircle size={18} className="text-status-error" />}
          title={t("dashboard.bannedAlert", {
            count: stats.bannedAccounts,
            accounts: stats.bannedAccounts > 1 ? t("common.accounts") : t("common.account"),
          })}
        />
      ) : null}

      {stats?.captchaAccounts ? (
        <AlertBanner
          href="/captcha"
          variant="pending"
          icon={<AlertTriangle size={18} className="text-status-pending" />}
          title={t("dashboard.captchaAlert", {
            count: stats.captchaAccounts,
            accounts: stats.captchaAccounts > 1 ? t("common.accounts") : t("common.account"),
          })}
          description={t("jobs.captchaHelp")}
          action={t("dashboard.captchaAlertAction")}
        />
      ) : null}

      {stats?.traffic ? (
        <Card className="p-5 mb-6 border-accent/25 bg-gradient-to-br from-accent/5 to-transparent">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                <UserPlus size={18} className="text-accent" />
                {t("dashboard.trafficTitle")}
              </h2>
              <p className="text-xs text-text-muted mt-1">{t("dashboard.trafficSubtitle")}</p>
            </div>
            <Link href="/search">
              <Button size="sm" variant="secondary">
                {t("dashboard.trafficGoSearch")}
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="font-display text-3xl font-semibold tabular-nums text-accent">
                {stats.traffic.friendsPerHour}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{t("dashboard.trafficFriendsHour")}</p>
              <p className="text-[11px] text-text-muted/80">{t("dashboard.trafficFriendsHourHint")}</p>
            </div>
            <div>
              <p className="font-display text-2xl font-semibold tabular-nums">
                {stats.traffic.readyForOutreach}
                <span className="text-sm text-text-muted font-normal">
                  {" "}
                  / {stats.traffic.activeAccounts}
                </span>
              </p>
              <p className="text-xs text-text-muted mt-0.5">{t("dashboard.trafficReady")}</p>
              <p className="text-[11px] text-text-muted/80">{t("dashboard.trafficReadyHint")}</p>
            </div>
            <div className="col-span-2 lg:col-span-1">
              <p className="font-display text-2xl font-semibold tabular-nums">
                {stats.traffic.pendingFriendJobs + stats.traffic.runningFriendJobs}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{t("dashboard.trafficQueue")}</p>
              <p className="text-[11px] text-text-muted/80">
                {t("dashboard.trafficQueueHint", {
                  pending: stats.traffic.pendingFriendJobs,
                  running: stats.traffic.runningFriendJobs,
                })}
              </p>
            </div>
          </div>
          <div className="border-t border-border-subtle pt-3">
            <p className="text-xs font-medium text-text-muted mb-2">{t("dashboard.trafficBlockers")}</p>
            {stats.traffic.blockers.filter((b) => b.key !== "queue").length === 0 ? (
              <p className="text-xs text-status-success">{t("dashboard.trafficNoBlockers")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stats.traffic.blockers
                  .filter((b) => b.key !== "queue")
                  .map((b) => (
                    <Link
                      key={b.key}
                      href={b.href}
                      className="text-xs px-2.5 py-1 rounded-full border border-status-warning/40 bg-status-warning/10 text-status-warning hover:border-status-warning/70 transition-colors"
                    >
                      {b.label}: {b.count}
                    </Link>
                  ))}
              </div>
            )}
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {(stats
          ? fleetCards
          : Array.from({ length: 4 }, (_, i) => ({
              key: `skeleton-${i}`,
              href: "#",
              icon: Users,
              value: "—",
              label: "…",
            }))
        ).map((card) => (
          <DashboardCard key={card.key} href={stats ? card.href : "/"}>
            <StatCardContent
              icon={card.icon}
              value={card.value ?? "—"}
              label={card.label}
              sublabel={"sublabel" in card ? card.sublabel : undefined}
            />
          </DashboardCard>
        ))}
      </div>

      <header className="mb-4">
        <h2 className="font-display text-lg font-semibold">{t("dashboard.analytics")}</h2>
        <p className="text-text-secondary text-sm mt-0.5">{t("dashboard.analyticsSubtitle")}</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {outreachCards.map(({ key, label, icon, href }) => {
          const failedTotal =
            stats?.last24h
              ? stats.last24h.friendsFailed + stats.last24h.subscribesFailed
              : "—";
          const value =
            key === "friendsFailed"
              ? failedTotal
              : key === "outreachOnProxy"
                ? stats?.proxies.outreachAccounts24h ?? "—"
                : stats?.last24h
                  ? stats.last24h[key]
                  : "—";

          return (
            <DashboardCard key={key} href={href}>
              <StatCardContent icon={icon} value={value} label={label} sublabel={t("dashboard.statWindow24h")} />
            </DashboardCard>
          );
        })}
      </div>

      <DashboardSectionCard href="/accounts" className="mb-8" nestedLinks>
        <CardHeader title={t("dashboard.topAccounts")} />
        <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="px-5 py-3">{t("common.username")}</th>
                <th className="px-5 py-3">{t("dashboard.outreachFriends")}</th>
                <th className="px-5 py-3">{t("dashboard.outreachFollows")}</th>
                <th className="px-5 py-3">{t("dashboard.outreachTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {!stats?.outreach.topAccounts.length ? (
                <tr>
                  <td colSpan={4} className="text-center text-text-muted py-8">
                    {t("dashboard.noOutreach")}
                  </td>
                </tr>
              ) : (
                stats.outreach.topAccounts.map((row) => (
                  <tr key={row.accountId}>
                    <td className="font-medium">
                      <Link
                        href={`/accounts/${row.accountId}`}
                        className="hover:text-accent transition-colors relative z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.username}
                      </Link>
                    </td>
                    <td className="px-5 py-3 tabular-nums">{row.friends}</td>
                    <td className="px-5 py-3 tabular-nums">{row.follows}</td>
                    <td className="px-5 py-3 tabular-nums font-medium">{row.total}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardSectionCard>

      <DashboardSectionCard href="/jobs">
        <CardHeader title={t("dashboard.recentJobs")} />
        <div className="ui-list">
          {!stats?.recentJobs?.length ? (
            <p className="ui-list-empty">{t("dashboard.noJobs")}</p>
          ) : (
            stats.recentJobs.map((job) => (
              <div key={job.id} className="ui-list-item flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-text-muted">
                    {t(`jobType.${job.type}`) !== `jobType.${job.type}` ? t(`jobType.${job.type}`) : job.type}
                  </span>
                  <span className="text-text-secondary">
                    {job.account?.username ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted">{formatDate(job.createdAt, locale)}</span>
                  <Badge status={job.status} />
                </div>
              </div>
            ))
          )}
        </div>
      </DashboardSectionCard>
    </PageShell>
  );
}