"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Send,
  ExternalLink,
  Users,
  Filter,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader } from "@/components/ui/card";
import { List, ListInteractiveItem } from "@/components/ui/list";
import { BombingModal } from "@/components/bombing-modal";
import { SearchToast } from "@/components/search-toast";
import { useI18n } from "@/lib/i18n/context";
import { queueBombingJobs } from "@/lib/bombing/jobs";
import {
  defaultProfileSearchFilters,
  loadProfileSearchFilters,
  saveProfileSearchFilters,
} from "@/lib/bombing/search-filters-storage";
import {
  LIST_MODES,
  listModeSearchOverrides,
  SEX_OPTIONS,
  ORDERBY_OPTIONS,
  COUNTRY_OPTIONS,
  COUNTRY_LABELS,
  type ProfileSearchFilters,
} from "@/lib/profile-search/filters";
import { PageHeader, PageShell } from "@/components/page-shell";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  username: string;
  status: string;
}

interface SearchResult {
  username: string;
  displayName: string;
  profileUrl: string;
  avatarUrl: string | null;
  meta: string;
  isChannel: boolean;
}

const QUICK_LIST_MODES = LIST_MODES.slice(0, 5);

function ResultSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-3 animate-pulse">
      <div className="w-4 h-4 rounded bg-surface-overlay" />
      <div className="w-11 h-11 rounded-full bg-surface-overlay" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-36 bg-surface-overlay rounded" />
        <div className="h-3 w-28 bg-surface-overlay rounded" />
      </div>
    </div>
  );
}

export default function SearchPage() {
  const { t, locale } = useI18n();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filters, setFilters] = useState<ProfileSearchFilters>(defaultProfileSearchFilters);
  const [friendAccountIds, setFriendAccountIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">("success");
  const [portalMounted, setPortalMounted] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [massModalOpen, setMassModalOpen] = useState(false);
  const [massInitialAccountIds, setMassInitialAccountIds] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showToast = useCallback((message: string, variant: "success" | "error" = "success") => {
    setToastVariant(variant);
    setToast(message);
  }, []);

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.status === "ACTIVE"),
    [accounts]
  );

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    setFilters(loadProfileSearchFilters());
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data: Account[]) => {
        setAccounts(data);
        const active = data.filter((a) => a.status === "ACTIVE");
        setFriendAccountIds(new Set(active.map((a) => a.id)));
      });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const update = (patch: Partial<ProfileSearchFilters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch, page: patch.page ?? 1 };
      saveProfileSearchFilters(next);
      return next;
    });
  };

  const runSearch = async (page = 1) => {
    setLoading(true);
    setError(null);
    setSelected(new Set());

    try {
      const res = await fetch("/api/search/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...filters,
          page,
          accountId: [...friendAccountIds][0] || undefined,
          ageMin: filters.ageMin || undefined,
          ageMax: filters.ageMax || undefined,
          createDate: filters.createDate || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "Search failed");
        setResults([]);
        return;
      }
      setResults(data.results);
      setSourceUrl(data.sourceUrl);
      const nextFilters = { ...filters, page };
      saveProfileSearchFilters(nextFilters);
      setFilters(nextFilters);
    } catch {
      setError("Network error");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const showQueuedToast = (
    accountIds: string[],
    targets: number,
    data: { assignments?: Array<{ targets: string[] }>; jobs?: unknown[]; skippedGlobal?: string[] }
  ) => {
    if (accountIds.length > 1 && data.assignments) {
      const totalAssigned = data.assignments.reduce((sum, a) => sum + a.targets.length, 0);
      showToast(
        t("search.massSendingDistributed", {
          targets: totalAssigned,
          accounts: data.jobs?.length ?? accountIds.length,
          skipped: data.skippedGlobal?.length ?? 0,
        })
      );
    } else {
      showToast(t("search.massSendingQueued", { count: targets }));
    }
  };

  const queueBothTargets = async (targets: string[], accountIds: string[]) => {
    if (!accountIds.length || !targets.length) return;
    setSending(true);
    try {
      const friendsData = await queueBombingJobs(accountIds, targets);
      showQueuedToast(accountIds, targets.length, friendsData);
      setSelected(new Set());
    } catch (err) {
      showToast(
        t("search.sendFailed", {
          error: err instanceof Error ? err.message : "Unknown error",
        }),
        "error"
      );
    } finally {
      setSending(false);
    }
  };

  const toggleSelect = (username: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(username) ? next.delete(username) : next.add(username);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(results.map((r) => r.username)));

  const toggleFriendAccount = (id: string) => {
    setFriendAccountIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllAccounts = () => setFriendAccountIds(new Set(activeAccounts.map((a) => a.id)));
  const clearAccounts = () => setFriendAccountIds(new Set());

  const openMassModal = () => {
    const initialIds = friendAccountIds.size
      ? [...friendAccountIds]
      : activeAccounts.map((a) => a.id);
    setMassInitialAccountIds(initialIds);
    setMassModalOpen(true);
  };

  const setListMode = (listMode: string) => {
    if (listMode) {
      update({ listMode, keywords: "", ...listModeSearchOverrides(listMode) });
    } else {
      update({
        listMode: "",
        keywords: "",
        sex: "Woman",
        verified: true,
        orderby: "relevance",
        createDate: 0,
      });
    }
  };

  const ages = Array.from({ length: 83 }, (_, i) => i + 18);
  const hasSelection = selected.size > 0;
  const canSend = hasSelection && friendAccountIds.size > 0;

  return (
    <PageShell size="xl" className={cn(hasSelection && "pb-28")}>
      <div className="mb-8">
        <PageHeader
          title={t("search.title")}
          subtitle={t("search.subtitle")}
          className="mb-0"
          actions={
            <Button onClick={openMassModal} className="shrink-0">
              <Sparkles size={14} /> {t("search.massSending")}
            </Button>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          {[
            { step: 1, label: t("search.stepAccounts"), value: String(friendAccountIds.size) },
            { step: 2, label: t("search.stepSearch"), value: results.length ? String(results.length) : "—" },
            { step: 3, label: t("search.stepSend"), value: selected.size ? String(selected.size) : "—" },
          ].map(({ step, label, value }) => (
            <div
              key={step}
              className="rounded-xl border border-border bg-surface-raised/80 px-4 py-3 flex items-center gap-3"
            >
              <span className="w-8 h-8 rounded-full bg-accent/15 text-accent text-sm font-semibold flex items-center justify-center shrink-0">
                {step}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
                <p className="text-lg font-semibold tabular-nums">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Card className="mb-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle bg-surface-overlay/30 flex items-center gap-2">
          <Users size={16} className="text-accent" />
          <h2 className="font-display text-sm font-semibold">{t("search.sendAccounts")}</h2>
          <span className="text-xs text-text-muted ml-auto tabular-nums">
            {friendAccountIds.size}/{activeAccounts.length}
          </span>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              onClick={selectAllAccounts}
              className="text-xs text-accent hover:underline"
            >
              {t("common.selectAll")}
            </button>
            <span className="text-text-muted text-xs">·</span>
            <button
              type="button"
              onClick={clearAccounts}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              {t("common.clear")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeAccounts.map((a) => {
              const on = friendAccountIds.has(a.id);
              return (
                <Chip
                  key={a.id}
                  active={on}
                  onClick={() => toggleFriendAccount(a.id)}
                  className="font-mono"
                >
                  {a.username}
                </Chip>
              );
            })}
            {!activeAccounts.length && (
              <span className="text-sm text-text-muted">{t("search.noAccount")}</span>
            )}
          </div>
          <p className="text-[11px] text-text-muted mt-3">{t("search.distributeHint")}</p>
        </div>
      </Card>

      <Card className="mb-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle bg-surface-overlay/30 flex items-center gap-2">
          <Search size={16} className="text-accent" />
          <h2 className="font-display text-sm font-semibold">{t("search.stepSearch")}</h2>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs text-text-muted mb-2 block">{t("search.listMode")}</label>
            <div className="flex flex-wrap gap-2">
              {QUICK_LIST_MODES.map((m) => (
                <Chip
                  key={m.value}
                  active={(filters.listMode ?? "") === m.value}
                  onClick={() => setListMode(m.value)}
                >
                  {t(m.labelKey)}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-text-muted mb-1 flex items-center gap-1.5">
              <Globe size={12} />
              {t("common.country")}
            </label>
            <Select
              value={filters.country ?? ""}
              onChange={(e) => update({ country: e.target.value })}
            >
              <option value="">{t("search.anyCountry")}</option>
              {COUNTRY_OPTIONS.filter(Boolean).map((code) => (
                <option key={code} value={code}>
                  {COUNTRY_LABELS[code] ?? code}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="text-xs text-text-muted mb-1 block">{t("search.keywords")}</label>
              <Input
                value={filters.keywords ?? ""}
                onChange={(e) => update({ keywords: e.target.value, listMode: "" })}
                placeholder={t("search.keywordsPlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && void runSearch(1)}
              />
              <p className="text-[11px] text-text-muted mt-1">{t("search.keywordsHint")}</p>
            </div>
            <Button onClick={() => runSearch(1)} disabled={loading} className="md:mb-5">
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> {t("common.searching")}
                </>
              ) : (
                <>
                  <Search size={14} /> {t("common.search")}
                </>
              )}
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <Filter size={14} />
            {t("search.moreFilters")}
            {filtersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {filtersOpen && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-border-subtle">
              <div>
                <label className="text-xs text-text-muted mb-1 block">{t("search.gender")}</label>
                <Select
                  value={filters.sex ?? ""}
                  onChange={(e) => update({ sex: e.target.value })}
                >
                  <option value="">{t("common.any")}</option>
                  {SEX_OPTIONS.filter(Boolean).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">{t("search.ageMin")}</label>
                <Select
                  value={filters.ageMin ?? 0}
                  onChange={(e) => update({ ageMin: Number(e.target.value) })}
                >
                  <option value={0}>{t("common.any")}</option>
                  {ages.map((a) => <option key={a} value={a}>{a}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">{t("search.ageMax")}</label>
                <Select
                  value={filters.ageMax ?? 0}
                  onChange={(e) => update({ ageMax: Number(e.target.value) })}
                >
                  <option value={0}>{t("common.any")}</option>
                  {ages.map((a) => <option key={a} value={a}>{a}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">{t("search.orderBy")}</label>
                <Select
                  value={filters.orderby ?? "relevance"}
                  onChange={(e) => update({ orderby: e.target.value as ProfileSearchFilters["orderby"] })}
                >
                  {ORDERBY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                  ))}
                </Select>
              </div>
              <div className="col-span-2 lg:col-span-4 flex flex-wrap gap-4 items-center pt-1">
                {[
                  { key: "verified" as const, label: t("search.verifiedOnly") },
                  { key: "hasPicture" as const, label: t("search.withPicture") },
                  { key: "hasVideo" as const, label: t("search.withVideo") },
                  { key: "isPornstar" as const, label: t("search.pornstar") },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!filters[key]}
                      onChange={(e) => update({ [key]: e.target.checked })}
                      className="rounded border-border"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-status-error rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2">
              {error}
            </p>
          )}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent"
            >
              <ExternalLink size={12} /> {t("search.viewOnXvideos")}
            </a>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title={`${t("search.results")}${results.length ? ` (${results.length})` : ""}`}
          action={
            results.length > 0 && !loading ? (
              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={selectAll}>{t("common.selectAll")}</Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  {t("common.clear")}
                </Button>
                {selected.size > 0 && friendAccountIds.size > 0 && (
                  <Button
                    size="sm"
                    disabled={sending}
                    onClick={() => queueBothTargets([...selected], [...friendAccountIds])}
                  >
                    {sending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    {t("search.sendSelected", { count: selected.size })}
                  </Button>
                )}
              </div>
            ) : undefined
          }
        />
        <List>
          {loading &&
            Array.from({ length: 6 }).map((_, i) => <ResultSkeleton key={i} />)}
          {!loading && !results.length && (
            <div className="px-5 py-16 text-center">
              <Search size={32} className="mx-auto text-text-muted/50 mb-3" />
              <p className="text-text-muted text-sm">{t("search.emptyState")}</p>
            </div>
          )}
          {!loading &&
            results.map((r) => {
              const isSelected = selected.has(r.username);
              return (
                <ListInteractiveItem
                  key={r.username}
                  selected={isSelected}
                  onClick={() => toggleSelect(r.username)}
                  className="flex items-center gap-4"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(r.username)}
                    onClick={(e) => e.stopPropagation()}
                    className="ui-checkbox accent-accent"
                  />
                  {r.avatarUrl ? (
                    <img
                      src={r.avatarUrl}
                      alt=""
                      className="w-11 h-11 rounded-full object-cover bg-surface-overlay ring-2 ring-border-subtle"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-surface-overlay ring-2 ring-border-subtle" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{r.displayName}</span>
                      {r.isChannel && (
                        <span className="text-[10px] uppercase font-mono text-text-muted border border-border-subtle px-1.5 py-0.5 rounded shrink-0">
                          {t("search.channel")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted font-mono truncate">@{r.username}</p>
                    {r.meta && <p className="text-xs text-text-secondary truncate mt-0.5">{r.meta}</p>}
                  </div>
                  <a
                    href={r.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-text-muted hover:text-accent p-1.5 shrink-0"
                  >
                    <ExternalLink size={14} />
                  </a>
                </ListInteractiveItem>
              );
            })}
        </List>

        {results.length > 0 && !loading && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle bg-surface-overlay/20">
            <Button
              variant="ghost"
              size="sm"
              disabled={(filters.page ?? 1) <= 1}
              onClick={() => runSearch((filters.page ?? 1) - 1)}
            >
              ← {t("common.prev")}
            </Button>
            <span className="text-xs text-text-muted font-mono tabular-nums">
              {t("common.page")} {filters.page ?? 1}
            </span>
            <Button variant="ghost" size="sm" onClick={() => runSearch((filters.page ?? 1) + 1)}>
              {t("common.next")} →
            </Button>
          </div>
        )}
      </Card>

      {portalMounted &&
        hasSelection &&
        createPortal(
          <div
            id="search-send-bar"
            className="fixed bottom-0 left-0 right-0 sm:left-56 z-[55] px-6 lg:px-8 py-4 border-t border-border bg-surface-raised shadow-[0_-8px_32px_rgba(0,0,0,0.45)] pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">
                  {t("search.selectionBar", { count: selected.size })}
                </p>
                <p className="text-xs text-text-muted">
                  {t("search.selectionBarHint", { accounts: friendAccountIds.size })}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  {t("common.clear")}
                </Button>
                <Button
                  size="sm"
                  disabled={!canSend || sending}
                  onClick={() => queueBothTargets([...selected], [...friendAccountIds])}
                >
                  {sending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  {t("search.sendSelected", { count: selected.size })}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {toast && portalMounted && (
        <SearchToast
          message={toast}
          variant={toastVariant}
          floating
          onDismiss={() => setToast(null)}
        />
      )}

      <BombingModal
        open={massModalOpen}
        onClose={() => setMassModalOpen(false)}
        accounts={accounts}
        initialAccountIds={massInitialAccountIds}
        selectedProfiles={[...selected]}
        filters={filters}
        searchAccountId={[...friendAccountIds][0]}
        onComplete={() => setSelected(new Set())}
        onQueued={(message) => showToast(message)}
      />
    </PageShell>
  );
}