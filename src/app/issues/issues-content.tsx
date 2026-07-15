"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/utils";
import { PageHeader, PageShell } from "@/components/page-shell";
import { useI18n } from "@/lib/i18n/context";
import type { OutreachIssue } from "@/lib/accounts/outreach-failures";

type GlobalOutreachIssue = OutreachIssue & {
  accountId: string;
  accountUsername: string;
};

type StatusFilter = "failed" | "skipped" | "all";

export default function IssuesPageContent() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const initialStatus = (searchParams.get("status") as StatusFilter) || "failed";

  const [filter, setFilter] = useState<StatusFilter>(
    ["failed", "skipped", "all"].includes(initialStatus) ? initialStatus : "failed"
  );
  const [issues, setIssues] = useState<GlobalOutreachIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GlobalOutreachIssue | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/outreach/issues?status=${filter}`);
      const data = await res.json();
      setIssues(data.issues ?? []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionLabel = (actionType: OutreachIssue["actionType"]) =>
    actionType === "subscribe"
      ? t("accountDetail.issueActionSubscribe")
      : t("accountDetail.issueActionFriends");

  const jobTypeLabel = (jobType?: string) =>
    jobType && t(`jobType.${jobType}`) !== `jobType.${jobType}`
      ? t(`jobType.${jobType}`)
      : jobType ?? "—";

  const tabs: { id: StatusFilter; label: string }[] = [
    { id: "failed", label: t("issues.tabFailed") },
    { id: "skipped", label: t("issues.tabSkipped") },
    { id: "all", label: t("issues.tabAll") },
  ];

  return (
    <PageShell size="xl">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-accent mb-6"
      >
        <ArrowLeft size={14} /> {t("issues.back")}
      </Link>

      <PageHeader
        title={t("issues.title")}
        subtitle={t("issues.subtitle")}
        className="mb-6"
      />

      <Card>
        <div className="flex gap-1 px-5 pt-4 border-b border-border-subtle">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                filter === id
                  ? "border-accent text-accent font-medium"
                  : "border-transparent text-text-muted hover:text-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ui-list">
          {loading && (
            <p className="ui-list-empty">{t("common.loading")}</p>
          )}
          {!loading && !issues.length && (
            <p className="ui-list-empty">{t("issues.empty")}</p>
          )}
          {!loading && issues.length > 0 && (
            <p className="px-5 py-2 text-[11px] text-text-muted border-b border-border-subtle">
              {t("accountDetail.issueClickHint")}
            </p>
          )}
          {issues.map((issue) => (
            <button
              key={`${issue.accountId}-${issue.id}`}
              type="button"
              onClick={() => setSelected(issue)}
              className="ui-list-item ui-list-item-interactive w-full flex items-center justify-between gap-4 text-sm text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-accent">@{issue.targetUser}</span>
                  <Link
                    href={`/accounts/${issue.accountId}?tab=issues`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-text-muted hover:text-accent"
                  >
                    {issue.accountUsername}
                  </Link>
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

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={t("accountDetail.issueDetailTitle")}
        wide
      >
        {selected && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base text-accent">@{selected.targetUser}</span>
              <Link
                href={`/accounts/${selected.accountId}?tab=issues`}
                className="text-xs text-text-muted hover:text-accent"
              >
                {selected.accountUsername}
              </Link>
              <span
                className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                  selected.status === "failed"
                    ? "text-status-error border-status-error/30"
                    : "text-status-pending border-status-pending/30"
                }`}
              >
                {selected.status}
              </span>
              <span className="text-[10px] uppercase font-mono text-text-muted border border-border-subtle px-1.5 py-0.5 rounded">
                {actionLabel(selected.actionType)}
              </span>
            </div>

            <div>
              <p className="text-xs text-text-muted mb-1">{t("accountDetail.issueWhatWrong")}</p>
              <p className="text-status-error bg-status-error/5 border border-status-error/20 rounded-lg px-3 py-2">
                {selected.errorMessage}
              </p>
            </div>

            <div>
              <p className="text-xs text-text-muted mb-2">{t("accountDetail.issueWhere")}</p>
              <dl className="space-y-2 rounded-lg border border-border bg-surface p-3">
                <div className="flex justify-between gap-4">
                  <dt className="text-text-muted shrink-0">{t("accountDetail.issueTargetProfile")}</dt>
                  <dd className="text-right">
                    <a
                      href={selected.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline inline-flex items-center gap-1"
                    >
                      {selected.profileUrl}
                      <ExternalLink size={12} />
                    </a>
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-text-muted shrink-0">{t("common.account")}</dt>
                  <dd className="text-right">
                    <Link
                      href={`/accounts/${selected.accountId}?tab=issues`}
                      className="text-accent hover:underline"
                    >
                      {selected.accountUsername}
                    </Link>
                  </dd>
                </div>
                {selected.jobId && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-muted shrink-0">{t("accountDetail.issueRelatedJob")}</dt>
                    <dd className="text-right">
                      <Link href="/jobs" className="text-accent hover:underline">
                        {jobTypeLabel(selected.jobType)} · {selected.jobId.slice(0, 8)}
                      </Link>
                      {selected.jobStatus && (
                        <span className="text-text-muted text-xs ml-2">
                          ({selected.jobStatus})
                        </span>
                      )}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-text-muted shrink-0">{t("accountDetail.issueWhen")}</dt>
                  <dd>{formatDate(selected.createdAt, locale)}</dd>
                </div>
              </dl>
            </div>

            <div>
              <p className="text-xs text-text-muted mb-1">{t("accountDetail.issueHint")}</p>
              <p className="text-text-secondary bg-surface-overlay rounded-lg px-3 py-2">
                {selected.hint}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}