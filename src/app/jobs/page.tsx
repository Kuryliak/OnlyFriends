"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import { List, ListEmpty, ListItem } from "@/components/ui/list";
import { AccountErrorRecovery } from "@/components/account-error-recovery";
import { CaptchaSolverActions } from "@/components/captcha-solver-actions";
import {
  accountNeedsRecovery,
  isAccountErrorMessage,
} from "@/lib/accounts/account-error";
import { formatDate } from "@/lib/utils";
import { PageHeader, PageShell } from "@/components/page-shell";
import { useI18n } from "@/lib/i18n/context";

type JobFilter = "all" | "running" | "captcha" | "success" | "error";

const RUNNING_STATUSES = new Set(["PENDING", "RUNNING", "PAUSED_CAPTCHA"]);

const JOB_FILTERS: { id: JobFilter; labelKey: string }[] = [
  { id: "all", labelKey: "jobs.filterAll" },
  { id: "running", labelKey: "jobs.filterRunning" },
  { id: "captcha", labelKey: "jobs.filterCaptcha" },
  { id: "success", labelKey: "jobs.filterSuccess" },
  { id: "error", labelKey: "jobs.filterError" },
];

function matchesJobFilter(status: string, filter: JobFilter): boolean {
  if (filter === "all") return true;
  if (filter === "running") return RUNNING_STATUSES.has(status);
  if (filter === "captcha") return status === "PAUSED_CAPTCHA";
  if (filter === "success") return status === "COMPLETED";
  return status === "FAILED";
}

interface Job {
  id: string;
  type: string;
  status: string;
  progress: number;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  accountId: string | null;
  account?: { id: string; username: string; status: string } | null;
}

function jobNeedsAccountRecovery(job: Job): boolean {
  if (!job.accountId) return false;
  if (accountNeedsRecovery(job.account?.status ?? "")) return true;
  return isAccountErrorMessage(job.errorMessage);
}

export default function JobsPage() {
  const { t, locale } = useI18n();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<JobFilter>("all");
  const filteredJobs = useMemo(
    () => jobs.filter((job) => matchesJobFilter(job.status, filter)),
    [jobs, filter]
  );

  const filterCounts = useMemo(
    () =>
      JOB_FILTERS.reduce(
        (acc, { id }) => {
          acc[id] = jobs.filter((job) => matchesJobFilter(job.status, id)).length;
          return acc;
        },
        {} as Record<JobFilter, number>
      ),
    [jobs]
  );

  const load = () => fetch("/api/jobs").then((r) => r.json()).then(setJobs);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  const action = async (id: string, act: "resume" | "cancel") => {
    await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: act }),
    });
    load();
  };

  const jobTypeLabel = (type: string) =>
    t(`jobType.${type}`) !== `jobType.${type}` ? t(`jobType.${type}`) : type;

  return (
    <PageShell size="lg">
      <PageHeader title={t("jobs.title")} subtitle={t("jobs.subtitle")} />

      <Card>
        <CardHeader title={t("common.queue")} />
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border-subtle/80 bg-surface-overlay/15">
          {JOB_FILTERS.map(({ id, labelKey }) => (
            <Chip key={id} active={filter === id} onClick={() => setFilter(id)}>
              {t(labelKey)}
              <span className="ml-1.5 tabular-nums text-text-muted">{filterCounts[id]}</span>
            </Chip>
          ))}
        </div>
        <List>
          {filteredJobs.map((job) => (
            <ListItem key={job.id}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-medium">{jobTypeLabel(job.type)}</span>
                  <span className="text-sm text-text-secondary">
                    {job.account?.username ?? "—"}
                  </span>
                  <Badge status={job.status} />
                </div>
                <div className="flex items-center gap-2">
                  {jobNeedsAccountRecovery(job) && job.accountId && (
                    <AccountErrorRecovery
                      accountId={job.accountId}
                      username={job.account?.username}
                      onResolved={load}
                    />
                  )}
                  {job.status === "PAUSED_CAPTCHA" && job.accountId && (
                    <CaptchaSolverActions
                      accountId={job.accountId}
                      jobId={job.id}
                      jobType={job.type}
                      onDone={load}
                    />
                  )}
                  {["PENDING", "PAUSED_CAPTCHA"].includes(job.status) && (
                    <Button size="sm" variant="ghost" onClick={() => action(job.id, "cancel")}>
                      <X size={12} />
                    </Button>
                  )}
                </div>
              </div>
              {job.errorMessage && (
                <p className="text-xs text-status-pending mt-1">{job.errorMessage}</p>
              )}
              {job.status === "PAUSED_CAPTCHA" && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-text-secondary leading-relaxed">{t("jobs.captchaHelp")}</p>
                  <p className="text-xs text-status-pending font-medium">{t("jobs.captchaBrowserHint")}</p>
                </div>
              )}
              <div className="flex gap-4 mt-2 text-[11px] text-text-muted font-mono">
                <span>{t("common.created")} {formatDate(job.createdAt, locale)}</span>
                {job.startedAt && <span>{t("common.started")} {formatDate(job.startedAt, locale)}</span>}
                {job.completedAt && <span>{t("common.done")} {formatDate(job.completedAt, locale)}</span>}
              </div>
              {job.status === "RUNNING" && (
                <div className="mt-2 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-accent to-accent-muted transition-all duration-300"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              )}
            </ListItem>
          ))}
          {!filteredJobs.length && (
            <ListEmpty>{jobs.length ? t("jobs.emptyFiltered") : t("jobs.empty")}</ListEmpty>
          )}
        </List>
      </Card>
    </PageShell>
  );
}