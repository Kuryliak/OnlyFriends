"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Cpu,
  RefreshCw,
  Save,
  RotateCcw,
  Circle,
  Clock,
  Layers,
  Radio,
  Terminal,
  Flame,
  EyeOff,
  AlertTriangle,
} from "lucide-react";
import type { AutoWarmupSettings } from "@/lib/settings/auto-warmup-shared";
import type { StealthSettings } from "@/lib/settings/stealth-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageShell } from "@/components/page-shell";
import { useI18n } from "@/lib/i18n/context";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  WORKER_SETTINGS_BOUNDS,
  WORKER_SETTINGS_PRESETS,
  type WorkerSettings,
  type WorkerSettingsField,
  type WorkerSettingsSources,
} from "@/lib/settings/worker-settings-shared";
import {
  applyNumericDraft,
  applyWarmupFieldUpdate,
  pickFormFromServerPoll,
  resolveWarmupFormForSave,
  type WarmupFieldKey,
  type WarmupFormLike,
} from "@/lib/workers/form-sync";

/** Worker settings draft: empty string while user clears a field. */
type WorkerSettingsDraft = {
  [K in WorkerSettingsField]: number | "";
};

type WorkerStatus = {
  settings: WorkerSettings;
  sources: WorkerSettingsSources;
  snapshot: {
    totalRunning: number;
    outreachRunning: number;
    busyAccounts: number;
    busyProxies: number;
    slotsAvailable: number;
    outreachSlotsAvailable: number;
  };
  queue: { pending: number; pausedCaptcha: number };
  runningJobs: Array<{
    id: string;
    type: string;
    startedAt: string | null;
    accountUsername: string | null;
    proxyName: string | null;
  }>;
  workers: Array<{ workerId: string; at: string; configSummary: string; online: boolean }>;
  autoWarmup: {
    settings: AutoWarmupSettings;
    eligibleNow: number;
  };
  stealth: {
    settings: StealthSettings;
    activeProxies: number;
    accountsWithoutProxy: number;
  };
};

const SETTING_FIELDS: Array<{
  key: WorkerSettingsField;
  labelKey: string;
  hintKey: string;
}> = [
  { key: "concurrency", labelKey: "workers.concurrency", hintKey: "workers.concurrencyHint" },
  { key: "proxyConcurrency", labelKey: "workers.proxyConcurrency", hintKey: "workers.proxyConcurrencyHint" },
  { key: "outreachConcurrency", labelKey: "workers.outreachConcurrency", hintKey: "workers.outreachConcurrencyHint" },
  { key: "pollMs", labelKey: "workers.pollMs", hintKey: "workers.pollMsHint" },
  { key: "startStaggerMs", labelKey: "workers.startStaggerMs", hintKey: "workers.startStaggerMsHint" },
  { key: "staleJobMs", labelKey: "workers.staleJobMs", hintKey: "workers.staleJobMsHint" },
];

export default function WorkersPage() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [form, setForm] = useState<WorkerSettingsDraft | null>(null);
  const [sources, setSources] = useState<WorkerSettingsSources | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [warmupForm, setWarmupForm] = useState<WarmupFormLike | null>(null);
  const [savingWarmup, setSavingWarmup] = useState(false);
  const [warmupSaved, setWarmupSaved] = useState(false);
  const [stealthForm, setStealthForm] = useState<StealthSettings | null>(null);
  const [savingStealth, setSavingStealth] = useState(false);
  const [stealthSaved, setStealthSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dirty flags as refs so status polling never clobbers in-progress edits
  // (load is stable and does not re-subscribe every keystroke).
  const formDirtyRef = useRef(false);
  const warmupDirtyRef = useRef(false);
  const stealthDirtyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/workers/status");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setStatus(json);
      setForm((prev) =>
        pickFormFromServerPoll(prev, json.settings as WorkerSettings, formDirtyRef.current)
      );
      setSources(json.sources);
      setWarmupForm((prev) =>
        pickFormFromServerPoll(
          prev,
          (json.autoWarmup?.settings as AutoWarmupSettings | undefined) ?? null,
          warmupDirtyRef.current
        )
      );
      setStealthForm((prev) =>
        pickFormFromServerPoll(
          prev,
          (json.stealth?.settings as StealthSettings | undefined) ?? null,
          stealthDirtyRef.current
        )
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
    }, 3000);
    return () => clearInterval(interval);
  }, [load]);

  const resolveWorkerFormForSave = (draft: WorkerSettingsDraft): WorkerSettings => {
    const out = {} as WorkerSettings;
    for (const key of Object.keys(WORKER_SETTINGS_BOUNDS) as WorkerSettingsField[]) {
      const value = draft[key];
      out[key] = value === "" ? WORKER_SETTINGS_BOUNDS[key].default : value;
    }
    return out;
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const payload = resolveWorkerFormForSave(form);
      const res = await fetch("/api/workers/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      formDirtyRef.current = false;
      setForm(json.settings);
      setSources(json.sources);
      setSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const resetToEnv = async () => {
    setResetting(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/workers/settings", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Reset failed");
      formDirtyRef.current = false;
      setForm(json.settings);
      setSources(json.sources);
      setSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const saveStealth = async () => {
    if (!stealthForm) return;
    setSavingStealth(true);
    setStealthSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/workers/stealth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stealthForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      stealthDirtyRef.current = false;
      setStealthForm(json.settings);
      setStealthSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingStealth(false);
    }
  };

  const saveWarmup = async () => {
    if (!warmupForm) return;
    setSavingWarmup(true);
    setWarmupSaved(false);
    setError(null);
    try {
      const payload = resolveWarmupFormForSave(warmupForm);
      const res = await fetch("/api/workers/auto-warmup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      warmupDirtyRef.current = false;
      setWarmupForm(json.settings);
      setWarmupSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingWarmup(false);
    }
  };

  const updateWarmupField = (key: WarmupFieldKey, raw: string | boolean) => {
    if (!warmupForm) return;
    const next = applyWarmupFieldUpdate(warmupForm, key, raw);
    if (!next) return;
    warmupDirtyRef.current = true;
    setWarmupForm(next);
    setWarmupSaved(false);
  };

  const applyPreset = (values: WorkerSettings) => {
    formDirtyRef.current = true;
    setForm(values);
    setSaved(false);
  };

  const updateField = (key: WorkerSettingsField, raw: string) => {
    if (!form) return;
    const next = applyNumericDraft(raw, form[key]);
    if (next === null) return;
    formDirtyRef.current = true;
    setForm({ ...form, [key]: next });
    setSaved(false);
  };

  const sourceLabel = (source: "db" | "env" | "default" | undefined) => {
    if (source === "db") return t("workers.sourceDb");
    if (source === "env") return t("workers.sourceEnv");
    return t("workers.sourceDefault");
  };

  const jobTypeLabel = (type: string) =>
    t(`jobType.${type}`) !== `jobType.${type}` ? t(`jobType.${type}`) : type;

  const workersOnline = (status?.workers.length ?? 0) > 0;

  return (
    <PageShell size="lg">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Cpu size={22} className="text-accent" />
            {t("workers.title")}
          </span>
        }
        subtitle={t("workers.subtitle")}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {t("common.refresh")}
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-text-muted flex items-center gap-1.5">
            <Circle
              size={10}
              className={cn(workersOnline ? "text-status-success fill-status-success" : "text-text-muted")}
            />
            {workersOnline ? t("workers.online") : t("workers.offline")}
          </p>
          <p className="font-display text-xl font-semibold tabular-nums mt-1">
            {status?.workers.length ?? "—"}
          </p>
          {!workersOnline && (
            <p className="text-[11px] text-text-muted mt-1">{t("workers.noWorkers")}</p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-muted flex items-center gap-1.5">
            <Layers size={12} />
            {t("workers.slots")}
          </p>
          <p className="font-display text-xl font-semibold tabular-nums mt-1">
            {status
              ? t("workers.slotsUsed", {
                  used: status.snapshot.totalRunning,
                  total: status.settings.concurrency,
                })
              : "—"}
          </p>
          {status && status.snapshot.slotsAvailable > 0 && (
            <p className="text-[11px] text-status-success mt-1">
              +{status.snapshot.slotsAvailable} свободно
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-muted flex items-center gap-1.5">
            <Radio size={12} />
            {t("workers.outreachSlots")}
          </p>
          <p className="font-display text-xl font-semibold tabular-nums mt-1">
            {status
              ? `${status.snapshot.outreachRunning}/${status.settings.outreachConcurrency}`
              : "—"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-muted">{t("workers.queuePending")}</p>
          <p className="font-display text-xl font-semibold tabular-nums mt-1">
            {status?.queue.pending ?? "—"}
          </p>
          {(status?.queue.pausedCaptcha ?? 0) > 0 && (
            <p className="text-[11px] text-status-warning mt-1">
              {t("workers.queuePaused")}: {status?.queue.pausedCaptcha}
            </p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader title={t("workers.runningJobs")} />
          <div className="ui-list max-h-64 overflow-y-auto">
            {!status?.runningJobs.length && (
              <p className="ui-list-empty">{t("workers.runningJobsEmpty")}</p>
            )}
            {status?.runningJobs.map((job) => (
              <div key={job.id} className="ui-list-item flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{jobTypeLabel(job.type)}</p>
                  <p className="text-xs text-text-muted truncate">
                    {job.accountUsername ?? "—"}
                    {job.proxyName ? ` · ${job.proxyName}` : ""}
                  </p>
                </div>
                {job.startedAt && (
                  <span className="text-[11px] text-text-muted shrink-0 flex items-center gap-1">
                    <Clock size={10} />
                    {formatDate(job.startedAt, locale)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-border-subtle">
            <Link href="/jobs" className="text-xs text-accent hover:underline">
              {t("nav.jobs")} →
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("workers.workerProcesses")} />
          <div className="ui-list">
            {!status?.workers.length && (
              <div className="ui-list-empty">
                <Terminal size={28} className="mx-auto text-text-muted/40 mb-2" />
                <p className="text-sm text-text-muted">{t("workers.noWorkers")}</p>
                <code className="text-xs font-mono text-accent mt-2 block">npm run worker</code>
              </div>
            )}
            {status?.workers.map((w) => (
              <div key={w.workerId} className="ui-list-item">
                <div className="flex items-center gap-2">
                  <Badge status="COMPLETED" />
                  <span className="font-mono text-sm">{w.workerId}</span>
                </div>
                <p className="text-xs text-text-muted mt-1">{w.configSummary}</p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {formatDate(w.at, locale)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5 mb-4 border-accent/20">
        <CardHeader title={t("workers.stealthTitle")} icon={<EyeOff size={16} />} />
        <p className="text-xs text-text-muted mt-3 mb-4">{t("workers.stealthHint")}</p>

        <div className="flex flex-wrap items-center gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={stealthForm?.enabled ?? false}
              onChange={(e) => {
                if (!stealthForm) return;
                stealthDirtyRef.current = true;
                setStealthForm({ ...stealthForm, enabled: e.target.checked });
                setStealthSaved(false);
              }}
              className="rounded border-border accent-accent"
            />
            {t("workers.stealthEnabled")}
          </label>
          {status?.stealth && (
            <>
              <span className="text-xs text-text-muted">
                {t("workers.stealthActiveProxies")}:{" "}
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    status.stealth.activeProxies === 0 ? "text-status-warning" : "text-text-primary"
                  )}
                >
                  {status.stealth.activeProxies}
                </span>
              </span>
              <span className="text-xs text-text-muted">
                {t("workers.stealthAccountsWithoutProxy")}:{" "}
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    status.stealth.accountsWithoutProxy > 0
                      ? "text-status-warning"
                      : "text-text-primary"
                  )}
                >
                  {status.stealth.accountsWithoutProxy}
                </span>
              </span>
            </>
          )}
        </div>

        {stealthForm?.enabled && status?.stealth?.activeProxies === 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2.5 mb-4">
            <AlertTriangle size={14} className="text-status-warning shrink-0 mt-0.5" />
            <p className="text-xs text-status-warning">{t("workers.stealthNoProxiesWarning")}</p>
          </div>
        )}

        {stealthForm?.enabled && (status?.stealth?.accountsWithoutProxy ?? 0) > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2.5 mb-4">
            <AlertTriangle size={14} className="text-status-warning shrink-0 mt-0.5" />
            <p className="text-xs text-status-warning">
              {t("workers.stealthAccountsWarning", {
                count: status?.stealth?.accountsWithoutProxy ?? 0,
              })}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border-subtle">
          <Button onClick={() => void saveStealth()} disabled={savingStealth || !stealthForm}>
            <EyeOff size={14} />
            {savingStealth ? t("common.saving") : t("common.save")}
          </Button>
          {stealthSaved && (
            <span className="text-xs text-status-success">{t("workers.stealthSaved")}</span>
          )}
        </div>
      </Card>

      <Card className="p-5 mb-4">
        <CardHeader title={t("workers.autoWarmupTitle")} />
        <p className="text-xs text-text-muted mt-3 mb-4">{t("workers.autoWarmupHint")}</p>

        <div className="flex flex-wrap items-center gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={warmupForm?.enabled ?? false}
              onChange={(e) => updateWarmupField("enabled", e.target.checked)}
              className="rounded border-border accent-accent"
            />
            {t("workers.autoWarmupEnabled")}
          </label>
          {status?.autoWarmup && (
            <span className="text-xs text-text-muted">
              {t("workers.autoWarmupEligible")}:{" "}
              <span className="font-semibold tabular-nums text-text-primary">
                {status.autoWarmup.eligibleNow}
              </span>
            </span>
          )}
        </div>

        <div className="space-y-4">
          {(
            [
              { key: "intervalMinutes" as const, labelKey: "workers.autoWarmupInterval", hintKey: "workers.autoWarmupIntervalHint" },
              { key: "durationMinutes" as const, labelKey: "workers.autoWarmupDuration", hintKey: "workers.autoWarmupDurationHint" },
              { key: "maxPerCycle" as const, labelKey: "workers.autoWarmupMaxPerCycle", hintKey: "workers.autoWarmupMaxPerCycleHint" },
            ] as const
          ).map(({ key, labelKey, hintKey }) => (
            <div key={key} className="grid grid-cols-1 sm:grid-cols-[1fr_8rem] gap-2 sm:gap-4 items-start">
              <div>
                <label className="text-sm font-medium">{t(labelKey)}</label>
                <p className="text-[11px] text-text-muted mt-0.5">{t(hintKey)}</p>
              </div>
              <Input
                type="text"
                inputMode="numeric"
                className="tabular-nums text-center"
                value={warmupForm?.[key] ?? ""}
                onChange={(e) => updateWarmupField(key, e.target.value)}
                disabled={!warmupForm?.enabled}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-border-subtle">
          <Button onClick={() => void saveWarmup()} disabled={savingWarmup || !warmupForm}>
            <Flame size={14} />
            {savingWarmup ? t("common.saving") : t("common.save")}
          </Button>
          {warmupSaved && <span className="text-xs text-status-success">{t("workers.saved")}</span>}
        </div>
      </Card>

      <Card className="p-5 mb-4">
        <CardHeader title={t("workers.settingsTitle")} />
        <p className="text-xs text-text-muted mt-3 mb-4">{t("workers.settingsHint")}</p>

        <div className="mb-5">
          <p className="text-xs font-medium text-text-muted mb-2">{t("workers.presets")}</p>
          <div className="flex flex-wrap gap-2">
            {WORKER_SETTINGS_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.values)}
                className="text-xs px-3 py-1.5 rounded-full border border-border text-text-secondary hover:border-accent/50 hover:text-accent transition-colors"
              >
                {t(preset.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {SETTING_FIELDS.map(({ key, labelKey, hintKey }) => (
            <div key={key} className="grid grid-cols-1 sm:grid-cols-[1fr_8rem] gap-2 sm:gap-4 items-start">
              <div>
                <label className="text-sm font-medium">{t(labelKey)}</label>
                <p className="text-[11px] text-text-muted mt-0.5">{t(hintKey)}</p>
                {sources && (
                  <span className="text-[10px] uppercase tracking-wide text-text-muted/80 mt-1 inline-block">
                    {sourceLabel(sources[key])}
                  </span>
                )}
              </div>
              <Input
                type="text"
                inputMode="numeric"
                className="tabular-nums text-center"
                value={form?.[key] ?? ""}
                onChange={(e) => updateField(key, e.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-border-subtle">
          <Button onClick={() => void save()} disabled={saving || !form}>
            <Save size={14} />
            {saving ? t("common.saving") : t("common.save")}
          </Button>
          <Button variant="secondary" onClick={() => void resetToEnv()} disabled={resetting}>
            <RotateCcw size={14} />
            {t("workers.resetToEnv")}
          </Button>
          {saved && <span className="text-xs text-status-success">{t("workers.saved")}</span>}
        </div>

        {error && (
          <p className="text-sm text-status-error mt-4">{error}</p>
        )}
      </Card>

      <div className="text-[11px] text-text-muted space-y-1">
        <p>{t("workers.accountRule")}</p>
        <p>
          {t("workers.proxyRule", { count: form?.proxyConcurrency ?? status?.settings.proxyConcurrency ?? 1 })}
        </p>
        <p>{t("workers.multiWorkerHint")}</p>
        <p>
          {t("workers.startCommand")}: <code className="font-mono text-accent">npm run worker</code>
          {" · "}
          <code className="font-mono text-accent">npm run workers</code>
        </p>
      </div>
    </PageShell>
  );
}