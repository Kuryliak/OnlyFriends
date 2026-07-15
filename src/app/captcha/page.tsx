"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Monitor, MousePointerClick, PlayCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { List, ListEmpty, ListItem } from "@/components/ui/list";
import { CaptchaSolverActions } from "@/components/captcha-solver-actions";
import { formatDate } from "@/lib/utils";
import { PageHeader, PageShell } from "@/components/page-shell";
import { useI18n } from "@/lib/i18n/context";

type PendingCaptchaItem = {
  accountId: string;
  username: string;
  accountStatus: string;
  jobId: string | null;
  jobType: string | null;
  jobStatus: string | null;
  errorMessage: string | null;
  updatedAt: string;
};

const STEPS = [
  { icon: MousePointerClick, key: "captcha.step1" },
  { icon: Monitor, key: "captcha.step2" },
  { icon: AlertTriangle, key: "captcha.step3" },
  { icon: PlayCircle, key: "captcha.step4" },
] as const;

export default function CaptchaPage() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<PendingCaptchaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/captcha/pending")
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [load]);

  const jobTypeLabel = (type: string | null) =>
    type && t(`jobType.${type}`) !== `jobType.${type}` ? t(`jobType.${type}`) : type ?? "—";

  return (
    <PageShell size="sm">
      <PageHeader title={t("captcha.title")} subtitle={t("captcha.subtitle")} />

      <Card className="mb-6">
        <CardHeader title={t("captcha.howToTitle")} icon={<AlertTriangle size={16} className="text-status-pending" />} />
        <div className="p-5 space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">{t("captcha.howToIntro")}</p>
          <ol className="space-y-3">
            {STEPS.map(({ icon: Icon, key }, index) => (
              <li key={key} className="flex gap-3 text-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-status-pending/15 text-status-pending font-mono text-xs font-semibold">
                  {index + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 text-text-primary font-medium">
                    <Icon size={14} className="text-status-pending shrink-0" />
                    {t(key)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-status-pending font-medium border-t border-border-subtle pt-3">
            {t("jobs.captchaBrowserHint")}
          </p>
          <p className="text-[11px] text-text-muted leading-relaxed">{t("captcha.workerRequired")}</p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t("captcha.queueTitle")}
          action={
            <span className="text-xs text-text-muted tabular-nums">
              {loading ? "…" : items.length}
            </span>
          }
        />
        <List>
          {items.map((item) => (
            <ListItem key={item.accountId}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/accounts/${item.accountId}`}
                      className="font-mono text-sm font-medium text-accent hover:underline"
                    >
                      {item.username}
                    </Link>
                    <Badge status={item.accountStatus} />
                    {item.jobType ? (
                      <span className="text-xs text-text-muted">{jobTypeLabel(item.jobType)}</span>
                    ) : null}
                  </div>
                  {item.errorMessage ? (
                    <p className="text-xs text-text-secondary leading-relaxed">{item.errorMessage}</p>
                  ) : null}
                  <p className="text-[11px] text-text-muted font-mono">
                    {t("captcha.updated")} {formatDate(item.updatedAt, locale)}
                  </p>
                </div>
                <CaptchaSolverActions
                  accountId={item.accountId}
                  jobId={item.jobId}
                  jobType={item.jobType}
                  onDone={load}
                  layout="stack"
                />
              </div>
            </ListItem>
          ))}
          {!loading && !items.length ? (
            <ListEmpty>{t("captcha.empty")}</ListEmpty>
          ) : null}
          {loading && !items.length ? (
            <ListEmpty>{t("common.loading")}</ListEmpty>
          ) : null}
        </List>
      </Card>
    </PageShell>
  );
}