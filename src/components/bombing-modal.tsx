"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Users, Target, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/lib/i18n/context";
import {
  collectSearchTargets,
  PREVIEW_SAMPLE_LIMIT,
  type CollectProgress,
  type CollectPhaseLabel,
} from "@/lib/bombing/collect-targets";
import { queueBombingJobs } from "@/lib/bombing/jobs";
import type { BombingAccount, JobResponse } from "@/lib/bombing/types";
import type { ProfileSearchFilters } from "@/lib/profile-search/filters";
import { cn } from "@/lib/utils";
const COUNT_PRESETS = [10, 25, 50, 100, 500] as const;

interface BombingModalProps {
  open: boolean;
  onClose: () => void;
  accounts: BombingAccount[];
  initialAccountIds?: string[];
  selectedProfiles?: string[];
  filters: ProfileSearchFilters;
  searchAccountId?: string;
  onComplete?: () => void;
  onQueued?: (message: string) => void;
}

export function BombingModal({
  open,
  onClose,
  accounts,
  initialAccountIds = [],
  selectedProfiles = [],
  filters,
  searchAccountId,
  onComplete,
  onQueued,
}: BombingModalProps) {
  const { t, locale } = useI18n();
  const [massUserCountInput, setMassUserCountInput] = useState("10");
  const [debouncedCountInput, setDebouncedCountInput] = useState("10");
  const [massAccountIds, setMassAccountIds] = useState<Set<string>>(new Set());
  const massTargetMode: "search" | "selected" =
    selectedProfiles.length > 0 ? "selected" : "search";
  const [massTargetTotal, setMassTargetTotal] = useState(0);
  const [massPreviewSample, setMassPreviewSample] = useState<string[]>([]);
  const [massLoading, setMassLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState<CollectProgress | null>(null);
  const [scanWidened, setScanWidened] = useState(false);
  const [massStarting, setMassStarting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  /** Default off: friends-only for max traffic. */
  const [chainSubscribe, setChainSubscribe] = useState(false);

  const targetsCacheRef = useRef<string[]>([]);
  const cachedCountRef = useRef(0);
  const fetchGenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const selectedKey = selectedProfiles.join(",");

  const activeAccounts = accounts.filter((a) => a.status === "ACTIVE");

  useEffect(() => {
    if (!open) return;

    const initial = initialAccountIds.length
      ? initialAccountIds.filter((id) => activeAccounts.some((a) => a.id === id))
      : activeAccounts.map((a) => a.id);

    setMassAccountIds(new Set(initial));
    const initialCount = String(Math.max(selectedProfiles.length || 10, 1));
    setMassUserCountInput(initialCount);
    setDebouncedCountInput(initialCount);
    setLocalError(null);
    setChainSubscribe(false);
  }, [open, accounts, initialAccountIds, selectedProfiles.length]);

  const parseMassUserCount = (raw = massUserCountInput, fallback = 1): number => {
    if (raw.trim() === "") return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, Math.min(500, parsed));
  };

  useEffect(() => {
    const parsed = parseMassUserCount(massUserCountInput);
    const delay = parsed >= 100 ? 900 : parsed >= 50 ? 600 : 400;
    const timer = setTimeout(() => setDebouncedCountInput(massUserCountInput), delay);
    return () => clearTimeout(timer);
  }, [massUserCountInput]);

  const massUserCount = parseMassUserCount(debouncedCountInput);

  const toggleMassAccount = (id: string) => {
    setMassAccountIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const applyCount = (count: number) => {
    const normalized = String(count);
    setMassUserCountInput(normalized);
    setDebouncedCountInput(normalized);
  };

  const applyTargets = (targets: string[], requestedCount: number) => {
    targetsCacheRef.current = targets;
    cachedCountRef.current = requestedCount;
    setMassTargetTotal(targets.length);
    setMassPreviewSample(targets.slice(0, PREVIEW_SAMPLE_LIMIT));
  };

  const refreshMassPreview = useCallback(async () => {
    if (!open) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = ++fetchGenRef.current;

    setMassLoading(true);
    setScanProgress(null);
    setLocalError(null);

    try {
      const { targets, widened } = await collectSearchTargets({
        count: massUserCount,
        mode: massTargetMode,
        selectedProfiles,
        filters,
        searchAccountId,
        signal: controller.signal,
        onProgress: (progress) => setScanProgress(progress),
      });

      if (gen !== fetchGenRef.current || controller.signal.aborted) return;

      setScanWidened(!!widened);
      applyTargets(targets, massUserCount);
      if (!targets.length && massTargetMode === "search") {
        setLocalError(t("search.massSendingNoSearch"));
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (gen !== fetchGenRef.current) return;
      setLocalError(err instanceof Error ? err.message : t("search.massSendingNoSearch"));
      setScanWidened(false);
      applyTargets([], massUserCount);
    } finally {
      if (gen === fetchGenRef.current) {
        setMassLoading(false);
        setScanProgress(null);
      }
    }
  }, [open, massUserCount, massTargetMode, selectedKey, filters, searchAccountId, t, selectedProfiles]);

  useEffect(() => {
    if (open) void refreshMassPreview();
    return () => abortRef.current?.abort();
  }, [open, massUserCount, massTargetMode, refreshMassPreview]);

  const notifyQueued = (data: JobResponse, ids: string[], count: number) => {
    const message =
      ids.length > 1 && data.assignments
        ? t("search.massSendingDistributed", {
            targets: data.assignments.reduce((sum, a) => sum + a.targets.length, 0),
            accounts: data.jobs?.length ?? ids.length,
            skipped: data.skippedGlobal?.length ?? 0,
          })
        : t("search.massSendingQueued", { count });

    if (onQueued) onQueued(message);
    else alert(message);
  };

  const startBombing = async () => {
    const ids = [...massAccountIds];
    if (!ids.length) {
      setLocalError(t("search.massSendingNoAccounts"));
      return;
    }

    const count = parseMassUserCount();
    setMassUserCountInput(String(count));
    setMassStarting(true);
    setLocalError(null);

    try {
      let targets = targetsCacheRef.current;
      if (!targets.length || cachedCountRef.current !== count) {
        const result = await collectSearchTargets({
          count,
          mode: massTargetMode,
          selectedProfiles,
          filters,
          searchAccountId,
          onProgress: (progress) => setScanProgress(progress),
        });
        targets = result.targets;
      }

      if (!targets.length) {
        setLocalError(t("search.massSendingNoSearch"));
        return;
      }

      if (targets.length < count) {
        onQueued?.(
          t("search.massSendingNotEnough", {
            found: targets.length,
            requested: count,
          })
        );
      }

      const friendsData = await queueBombingJobs(ids, targets, { chainSubscribe });
      onClose();
      onComplete?.();
      notifyQueued(friendsData, ids, targets.length);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : t("search.massSendingNoSearch"));
    } finally {
      setMassStarting(false);
    }
  };

  const previewMore = Math.max(0, massTargetTotal - massPreviewSample.length);

  const phaseLabelKey: Record<CollectPhaseLabel, string> = {
    strict: "search.massSendingPhaseStrict",
    broader: "search.massSendingPhaseBroader",
    unverified: "search.massSendingPhaseUnverified",
    newProfiles: "search.massSendingPhaseNewProfiles",
  };

  const progressPercent = scanProgress
    ? Math.min(100, Math.round((scanProgress.found / scanProgress.requested) * 100))
    : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("search.massSendingTitle")}
      wide
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          {massLoading && (
            <p className="text-xs text-text-muted flex items-center gap-2 sm:max-w-[50%]">
              <Loader2 size={12} className="animate-spin shrink-0 text-accent" />
              {scanProgress
                ? t("search.massSendingScanProgress", {
                    found: scanProgress.found,
                    requested: scanProgress.requested,
                    page: scanProgress.page,
                    phase: scanProgress.phase,
                    total: scanProgress.phaseTotal,
                  })
                : t("search.massSendingCollecting", { count: massUserCount })}
            </p>
          )}
          <div className="flex justify-end gap-2 sm:ml-auto">
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={startBombing}
              disabled={massStarting || massLoading || massTargetTotal === 0 || !massAccountIds.size}
            >
              {massStarting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> {t("search.massSendingStarting")}
                </>
              ) : massLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> {t("search.massSendingCollecting", { count: massUserCount })}
                </>
              ) : (
                <>
                  <Sparkles size={14} /> {t("search.massSendingStart")}
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      <p className="text-sm text-text-secondary -mt-2 mb-5">{t("search.massSendingIntro")}</p>

      <div className="space-y-5">
        <section className="rounded-xl border border-accent/25 bg-accent/5 p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 rounded border-border accent-accent"
              checked={!chainSubscribe}
              onChange={(e) => setChainSubscribe(!e.target.checked)}
            />
            <span>
              <span className="text-sm font-semibold block">{t("search.massSendingFriendsOnly")}</span>
              <span className="text-[11px] text-text-muted">{t("search.massSendingFriendsOnlyHint")}</span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer mt-3 pt-3 border-t border-border-subtle">
            <input
              type="checkbox"
              className="mt-1 rounded border-border accent-accent"
              checked={chainSubscribe}
              onChange={(e) => setChainSubscribe(e.target.checked)}
            />
            <span>
              <span className="text-sm font-medium block">{t("search.massSendingAlsoSubscribe")}</span>
              <span className="text-[11px] text-text-muted">{t("search.massSendingAlsoSubscribeHint")}</span>
            </span>
          </label>
          <p className="text-[11px] text-text-muted mt-3">{t("search.massSendingHint")}</p>
        </section>

        <section className="rounded-xl border border-border bg-surface-overlay/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target size={16} className="text-accent" />
            <h3 className="text-sm font-semibold">{t("search.massSendingCount")}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="max-w-[6rem] text-center font-semibold tabular-nums"
              value={massUserCountInput}
              onChange={(e) => {
                const next = e.target.value;
                if (next === "" || /^\d+$/.test(next)) setMassUserCountInput(next);
              }}
              onBlur={() => applyCount(parseMassUserCount())}
            />
            <span className="text-xs text-text-muted">{t("search.massSendingCountHint")}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {COUNT_PRESETS.map((preset) => (
              <Chip
                key={preset}
                active={massUserCount === preset}
                onClick={() => applyCount(preset)}
              >
                {preset}
              </Chip>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface-overlay/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-accent" />
              <h3 className="text-sm font-semibold">{t("search.massSendingAccounts")}</h3>
            </div>
            <span className="text-xs text-text-muted tabular-nums">
              {massAccountIds.size}/{activeAccounts.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeAccounts.map((a) => {
              const on = massAccountIds.has(a.id);
              return (
                <Chip
                  key={a.id}
                  active={on}
                  onClick={() => toggleMassAccount(a.id)}
                  className="font-mono"
                >
                  {a.username}
                </Chip>
              );
            })}
            {!activeAccounts.length && (
              <span className="text-xs text-text-muted">{t("search.noAccount")}</span>
            )}
          </div>
        </section>

        {selectedProfiles.length > 0 ? (
          <section className="rounded-xl border border-border bg-surface-overlay/30 p-4">
            <h3 className="text-sm font-semibold mb-2">{t("search.massSendingSource")}</h3>
            <p className="text-sm text-text-secondary">
              {t("search.massSendingFromSelected", { count: selectedProfiles.length })}
            </p>
          </section>
        ) : (
          <section className="rounded-xl border border-border bg-surface-overlay/30 p-4">
            <h3 className="text-sm font-semibold mb-2">{t("search.massSendingSource")}</h3>
            <p className="text-sm text-text-secondary">{t("search.massSendingFromSearch")}</p>
          </section>
        )}

        <section className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border-subtle bg-surface-overlay/40 flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
              {t("search.massSendingPreview")}
            </span>
            {massTargetTotal > 0 && (
              <span className="text-sm text-accent font-semibold tabular-nums">{massTargetTotal}</span>
            )}
          </div>
          <div className="max-h-40 overflow-y-auto p-3 scrollbar-thin">
            {massLoading ? (
              <div className="py-5 px-2 space-y-3">
                <div className="flex items-center justify-center gap-2 text-sm text-text-secondary">
                  <Loader2 size={16} className="animate-spin text-accent" />
                  <span>
                    {scanProgress
                      ? t("search.massSendingScanProgress", {
                          found: scanProgress.found,
                          requested: scanProgress.requested,
                          page: scanProgress.page,
                          phase: scanProgress.phase,
                          total: scanProgress.phaseTotal,
                        })
                      : t("search.massSendingCollecting", { count: massUserCount })}
                  </span>
                </div>
                {scanProgress && (
                  <>
                    <div className="h-2 rounded-full bg-surface-overlay overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-300 ease-out"
                        style={{ width: `${Math.max(progressPercent, 2)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-center text-text-muted">
                      {t(phaseLabelKey[scanProgress.phaseLabel])}
                    </p>
                  </>
                )}
              </div>
            ) : massTargetTotal > 0 ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {massPreviewSample.map((u) => (
                    <span
                      key={u}
                      className="text-xs font-mono px-2 py-0.5 rounded-full bg-surface-overlay text-text-secondary border border-border-subtle"
                    >
                      @{u}
                    </span>
                  ))}
                </div>
                {previewMore > 0 && (
                  <p className="text-xs text-text-muted mt-3">
                    {t("search.massSendingPreviewMore", { count: previewMore })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-text-muted text-center py-4">{t("search.massSendingNoSearch")}</p>
            )}
          </div>
          {massTargetTotal > 0 && massAccountIds.size > 0 && (
            <div className="px-4 py-3 border-t border-border-subtle bg-accent/5 text-xs text-text-secondary space-y-1">
              <p>
                {t("search.massSendingWillDo", {
                  count: massTargetTotal,
                  accounts: massAccountIds.size,
                })}
              </p>
              {scanWidened && (
                <p className="text-text-muted">{t("search.massSendingWidenedHint")}</p>
              )}
            </div>
          )}
        </section>

        {localError && (
          <p className="text-sm text-status-error rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2">
            {localError}
          </p>
        )}

        <p className="text-[11px] text-text-muted">{t("search.massSendingHint")}</p>
      </div>
    </Modal>
  );
}