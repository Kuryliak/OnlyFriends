"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  UserPlus,
  Bell,
  ExternalLink,
  Pencil,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { avatarPublicUrl } from "@/lib/avatars/urls";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/utils";
import { profileUrlForAccount } from "@/lib/accounts/profile-url";
import { AccountErrorRecovery } from "@/components/account-error-recovery";
import { CaptchaSolverActions } from "@/components/captcha-solver-actions";
import { accountNeedsCaptcha, accountNeedsRecovery } from "@/lib/accounts/account-error";
import { useI18n } from "@/lib/i18n/context";

interface OutreachIssue {
  id: string;
  targetUser: string;
  status: "failed" | "skipped";
  actionType: "friends" | "subscribe";
  errorMessage: string;
  profileUrl: string;
  jobId?: string;
  jobType?: string;
  jobStatus?: string;
  createdAt: string;
  hint: string;
}

interface AccountDetail {
  id: string;
  username: string;
  email: string | null;
  emailVerified: boolean;
  password: string;
  displayName: string | null;
  profileSlug: string | null;
  bio: string | null;
  avatarPath: string | null;
  status: string;
  lastActive: string | null;
  createdAt: string;
  updatedAt: string;
  group?: { id: string; name: string; color: string } | null;
  proxy?: { id: string; name: string } | null;
  stats: {
    mutualFriends: number;
    friendRequestsSent: number;
    friendsAdded: number;
    followsSent: number;
    friendsFailed: number;
    friendsSkipped: number;
    inProgress: number;
  };
  mutualFriends: Array<{ targetUser: string; syncedAt: string | null }>;
  friendRequestsSent: Array<{ targetUser: string; syncedAt: string | null }>;
  friendStatsSyncedAt: string | null;
  friendsAdded: Array<{ targetUser: string; createdAt: string }>;
  followsSent: Array<{ targetUser: string; createdAt: string }>;
  outreachIssues: OutreachIssue[];
  recentJobs: Array<{
    id: string;
    type: string;
    status: string;
    errorMessage: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
}

type OutreachTab = "mutual" | "sent" | "follows" | "issues";

export default function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tabParam = searchParams.get("tab");
  const initialTab: OutreachTab =
    tabParam === "issues" || tabParam === "follows" || tabParam === "sent"
      ? tabParam
      : "mutual";
  const [tab, setTab] = useState<OutreachTab>(initialTab);
  const [selectedIssue, setSelectedIssue] = useState<OutreachIssue | null>(null);
  const [openingProfile, setOpeningProfile] = useState(false);

  const profileUrl = account ? profileUrlForAccount(account) : null;

  const reload = () => {
    setLoading(true);
    fetch(`/api/accounts/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setAccount)
      .catch(() => setError(t("accountDetail.notFound")))
      .finally(() => setLoading(false));
  };

  const openBotProfile = async () => {
    if (!account) return;
    setOpeningProfile(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}/view-profile`, { method: "POST" });
      const data = await res.json();
      if (data.profileSlug) {
        setAccount((prev) => (prev ? { ...prev, profileSlug: data.profileSlug } : prev));
      }
    } finally {
      setOpeningProfile(false);
    }
  };

  useEffect(() => {
    const nextTab = searchParams.get("tab");
    if (nextTab === "issues" || nextTab === "follows" || nextTab === "sent" || nextTab === "mutual") {
      setTab(nextTab);
    }
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/accounts/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setAccount)
      .catch(() => setError(t("accountDetail.notFound")))
      .finally(() => setLoading(false));
  }, [id, t]);

  if (loading) {
    return (
      <div className="p-8 max-w-6xl">
        <p className="text-sm text-text-muted">{t("common.loading")}</p>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="p-8 max-w-6xl">
        <Link
          href="/accounts"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-accent mb-6"
        >
          <ArrowLeft size={14} /> {t("accountDetail.back")}
        </Link>
        <p className="text-sm text-status-error">{error ?? t("accountDetail.notFound")}</p>
      </div>
    );
  }

  const issueCount = account.outreachIssues.length;

  const statCards = [
    { key: "mutualFriends", label: t("accountDetail.mutualFriends"), icon: UserPlus, tab: "mutual" as const },
    {
      key: "friendRequestsSent",
      label: t("accountDetail.friendRequestsSent"),
      icon: UserPlus,
      tab: "sent" as const,
    },
    { key: "followsSent", label: t("accountDetail.followsSent"), icon: Bell, tab: "follows" as const },
    { key: "friendsFailed", label: t("accountDetail.failed"), icon: AlertCircle, tab: "issues" as const },
    { key: "friendsSkipped", label: t("accountDetail.skipped"), icon: AlertCircle, tab: "issues" as const },
  ] as const;

  const tabs: { id: OutreachTab; label: string; count: number }[] = [
    { id: "mutual", label: t("accountDetail.tabMutualFriends"), count: account.stats.mutualFriends },
    { id: "sent", label: t("accountDetail.tabSentRequests"), count: account.stats.friendRequestsSent },
    { id: "follows", label: t("accountDetail.tabFollows"), count: account.followsSent.length },
    { id: "issues", label: t("accountDetail.tabIssues"), count: issueCount },
  ];

  const actionLabel = (actionType: OutreachIssue["actionType"]) =>
    actionType === "subscribe"
      ? t("accountDetail.issueActionSubscribe")
      : t("accountDetail.issueActionFriends");

  const jobTypeLabel = (jobType?: string) =>
    jobType && t(`jobType.${jobType}`) !== `jobType.${jobType}`
      ? t(`jobType.${jobType}`)
      : jobType ?? "—";

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <Link
            href="/accounts"
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-accent mb-4"
          >
            <ArrowLeft size={14} /> {t("accountDetail.back")}
          </Link>
          <div className="flex items-center gap-4">
            {account.avatarPath ? (
              <img
                src={avatarPublicUrl(account.avatarPath)}
                alt=""
                className="w-16 h-16 rounded-full object-cover bg-surface-overlay"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-surface-overlay" />
            )}
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-2xl font-semibold">{account.username}</h1>
                <Badge status={account.status} />
              </div>
              {account.displayName && (
                <p className="text-text-secondary text-sm mt-0.5">{account.displayName}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-1">
                {profileUrl && (
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent"
                  >
                    <ExternalLink size={12} /> {t("accountDetail.viewProfile")}
                  </a>
                )}
                <button
                  type="button"
                  onClick={openBotProfile}
                  disabled={openingProfile || account.status !== "ACTIVE"}
                  className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent disabled:opacity-50"
                >
                  <ExternalLink size={12} />
                  {openingProfile
                    ? t("accountDetail.openingProfile")
                    : t("accountDetail.viewProfileBot")}
                </button>
              </div>
              {account.profileSlug && (
                <p className="text-[11px] text-text-muted mt-1 font-mono">@{account.profileSlug}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {accountNeedsCaptcha(account.status) && (
            <CaptchaSolverActions
              accountId={account.id}
              onDone={reload}
              layout="stack"
            />
          )}
          {accountNeedsRecovery(account.status) && (
            <AccountErrorRecovery
              accountId={account.id}
              username={account.username}
              onResolved={reload}
              variant="primary"
            />
          )}
          <Link href="/accounts">
            <Button variant="secondary" size="sm">
              <Pencil size={14} /> {t("accountDetail.manage")}
            </Button>
          </Link>
        </div>
      </div>

      {accountNeedsCaptcha(account.status) && (
        <div className="mb-6 rounded-xl border border-status-pending/30 bg-status-pending/10 px-4 py-3 text-sm text-text-secondary leading-relaxed">
          <p>{t("captcha.accountBanner")}</p>
          <Link href="/captcha" className="inline-block mt-2 text-xs font-medium text-status-pending hover:underline">
            {t("captcha.goToCaptcha")} →
          </Link>
        </div>
      )}

      {accountNeedsRecovery(account.status) && (
        <div className="mb-6 rounded-xl border border-status-error/30 bg-status-error/10 px-4 py-3 text-sm text-text-secondary leading-relaxed">
          {t("accountRecovery.errorBanner")}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {statCards.map(({ key, label, icon: Icon, tab: targetTab }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(targetTab)}
            className="text-left"
          >
            <Card className="p-4 hover:border-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className="text-text-muted" />
                <p className="text-xs text-text-muted">{label}</p>
              </div>
              <p className="font-display text-2xl font-semibold tabular-nums">
                {account.stats[key]}
              </p>
            </Card>
          </button>
        ))}
      </div>

      <Card className="p-5 mb-6">
        <CardHeader title={t("accountDetail.info")} />
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm mt-4">
          <div>
            <dt className="text-xs text-text-muted mb-0.5">{t("common.email")}</dt>
            <dd>
              {account.email || "—"}
              {account.email && (
                <span className={`ml-2 text-xs ${account.emailVerified ? "text-status-success" : "text-text-muted"}`}>
                  ({account.emailVerified ? t("accounts.emailVerified") : t("accounts.emailUnverified")})
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted mb-0.5">{t("common.password")}</dt>
            <dd className="font-mono text-xs">{account.password}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted mb-0.5">{t("accounts.group")}</dt>
            <dd>
              {account.group ? (
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: account.group.color }}
                  />
                  {account.group.name}
                </span>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted mb-0.5">{t("accounts.proxy")}</dt>
            <dd>{account.proxy?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted mb-0.5">{t("accounts.lastActive")}</dt>
            <dd>{formatDate(account.lastActive, locale)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted mb-0.5">{t("accountDetail.created")}</dt>
            <dd>{formatDate(account.createdAt, locale)}</dd>
          </div>
          {account.bio && (
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-xs text-text-muted mb-0.5">{t("accounts.bio")}</dt>
              <dd className="text-text-secondary">{account.bio}</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card className="mb-6">
        <CardHeader title={t("accountDetail.outreach")} />
        <div className="flex gap-1 px-5 pt-4 border-b border-border-subtle">
          {tabs.map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                tab === id
                  ? "border-accent text-accent font-medium"
                  : "border-transparent text-text-muted hover:text-text-primary"
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
        <div className="ui-list">
          {tab === "mutual" && !account.mutualFriends.length && (
            <p className="ui-list-empty">
              {t("accountDetail.noMutualFriends")}
            </p>
          )}
          {tab === "mutual" &&
            account.mutualFriends.map((item) => (
              <OutreachRow
                key={`mutual-${item.targetUser}`}
                targetUser={item.targetUser}
                dateLabel={item.syncedAt ? formatDate(item.syncedAt, locale) : "—"}
                profileLabel={t("accountDetail.viewTarget")}
              />
            ))}

          {tab === "sent" && !account.friendRequestsSent.length && (
            <p className="ui-list-empty">
              {t("accountDetail.noSentRequests")}
            </p>
          )}
          {tab === "sent" &&
            account.friendRequestsSent.map((item) => (
              <OutreachRow
                key={`sent-${item.targetUser}`}
                targetUser={item.targetUser}
                dateLabel={item.syncedAt ? formatDate(item.syncedAt, locale) : "—"}
                profileLabel={t("accountDetail.viewTarget")}
              />
            ))}

          {tab === "follows" && !account.followsSent.length && (
            <p className="ui-list-empty">
              {t("accountDetail.noFollows")}
            </p>
          )}
          {tab === "follows" &&
            account.followsSent.map((item) => (
              <OutreachRow
                key={`follow-${item.targetUser}`}
                targetUser={item.targetUser}
                dateLabel={formatDate(item.createdAt, locale)}
                profileLabel={t("accountDetail.viewTarget")}
              />
            ))}

          {tab === "issues" && !account.outreachIssues.length && (
            <p className="ui-list-empty">
              {t("accountDetail.noFailed")}
            </p>
          )}
          {tab === "issues" && account.outreachIssues.length > 0 && (
            <p className="px-5 py-2 text-[11px] text-text-muted border-b border-border-subtle">
              {t("accountDetail.issueClickHint")}
            </p>
          )}
          {tab === "issues" &&
            account.outreachIssues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => setSelectedIssue(issue)}
                className="w-full flex items-center justify-between gap-4 px-5 py-3 text-sm text-left hover:bg-surface-overlay/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-accent">@{issue.targetUser}</span>
                    <span
                      className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                        issue.status === "failed"
                          ? "text-status-error border-status-error/30"
                          : "text-status-pending border-status-pending/30"
                      }`}
                    >
                      {issue.status}
                    </span>
                    <span className="text-[10px] uppercase font-mono text-text-muted border border-border-subtle px-1.5 py-0.5 rounded">
                      {actionLabel(issue.actionType)}
                    </span>
                  </div>
                  <p className="text-xs text-status-error mt-1 truncate">{issue.errorMessage}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-text-muted">
                    {formatDate(issue.createdAt, locale)}
                  </span>
                  <ChevronRight size={14} className="text-text-muted" />
                </div>
              </button>
            ))}
        </div>
      </Card>

      <Card>
        <CardHeader title={t("accountDetail.recentJobs")} />
        <div className="ui-list">
          {!account.recentJobs.length ? (
            <p className="ui-list-empty">
              {t("dashboard.noJobs")}
            </p>
          ) : (
            account.recentJobs.map((job) => (
              <div
                key={job.id}
                className="ui-list-item flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs text-text-muted shrink-0">
                    {jobTypeLabel(job.type)}
                  </span>
                  {job.errorMessage && (
                    <span className="text-xs text-status-error truncate">
                      {job.errorMessage}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Link
                    href="/jobs"
                    className="text-xs text-text-muted hover:text-accent font-mono"
                  >
                    {job.id.slice(0, 8)}
                  </Link>
                  <span className="text-xs text-text-muted">
                    {formatDate(job.createdAt, locale)}
                  </span>
                  <Badge status={job.status} />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Modal
        open={selectedIssue !== null}
        onClose={() => setSelectedIssue(null)}
        title={t("accountDetail.issueDetailTitle")}
        wide
      >
        {selectedIssue && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base text-accent">@{selectedIssue.targetUser}</span>
              <span
                className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                  selectedIssue.status === "failed"
                    ? "text-status-error border-status-error/30"
                    : "text-status-pending border-status-pending/30"
                }`}
              >
                {selectedIssue.status}
              </span>
              <span className="text-[10px] uppercase font-mono text-text-muted border border-border-subtle px-1.5 py-0.5 rounded">
                {actionLabel(selectedIssue.actionType)}
              </span>
            </div>

            <div>
              <p className="text-xs text-text-muted mb-1">{t("accountDetail.issueWhatWrong")}</p>
              <p className="text-status-error bg-status-error/5 border border-status-error/20 rounded-lg px-3 py-2">
                {selectedIssue.errorMessage}
              </p>
            </div>

            <div>
              <p className="text-xs text-text-muted mb-2">{t("accountDetail.issueWhere")}</p>
              <dl className="space-y-2 rounded-lg border border-border bg-surface p-3">
                <div className="flex justify-between gap-4">
                  <dt className="text-text-muted shrink-0">{t("accountDetail.issueTargetProfile")}</dt>
                  <dd className="text-right">
                    <a
                      href={selectedIssue.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline inline-flex items-center gap-1"
                    >
                      {selectedIssue.profileUrl}
                      <ExternalLink size={12} />
                    </a>
                  </dd>
                </div>
                {selectedIssue.jobId && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-muted shrink-0">{t("accountDetail.issueRelatedJob")}</dt>
                    <dd className="text-right">
                      <Link href="/jobs" className="text-accent hover:underline">
                        {jobTypeLabel(selectedIssue.jobType)} · {selectedIssue.jobId.slice(0, 8)}
                      </Link>
                      {selectedIssue.jobStatus && (
                        <span className="text-text-muted text-xs ml-2">
                          ({selectedIssue.jobStatus})
                        </span>
                      )}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-text-muted shrink-0">{t("accountDetail.issueWhen")}</dt>
                  <dd>{formatDate(selectedIssue.createdAt, locale)}</dd>
                </div>
              </dl>
            </div>

            <div>
              <p className="text-xs text-text-muted mb-1">{t("accountDetail.issueHint")}</p>
              <p className="text-text-secondary bg-surface-overlay rounded-lg px-3 py-2">
                {selectedIssue.hint}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function OutreachRow({
  targetUser,
  dateLabel,
  profileLabel,
}: {
  targetUser: string;
  dateLabel: string;
  profileLabel: string;
}) {
  return (
    <div className="ui-list-item flex items-center justify-between text-sm">
      <a
        href={`https://www.xvideos.com/profiles/${targetUser}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-accent hover:underline"
      >
        @{targetUser}
      </a>
      <div className="flex items-center gap-3">
        <span className="text-xs text-text-muted">{dateLabel}</span>
        <a
          href={`https://www.xvideos.com/profiles/${targetUser}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-text-muted hover:text-accent inline-flex items-center gap-1"
        >
          <ExternalLink size={12} /> {profileLabel}
        </a>
      </div>
    </div>
  );
}