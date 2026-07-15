"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Flame, LogIn, ImagePlus, Sparkles, MailCheck, Minus } from "lucide-react";
import { avatarPublicUrl } from "@/lib/avatars/urls";
import { generateWomanAccounts } from "@/lib/accounts/generate-credentials";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { formatApiError } from "@/lib/api/format-error";
import { formatDate } from "@/lib/utils";
import { AccountErrorRecovery } from "@/components/account-error-recovery";
import { CaptchaSolverActions } from "@/components/captcha-solver-actions";
import { accountNeedsCaptcha, accountNeedsRecovery } from "@/lib/accounts/account-error";
import { PageHeader, PageShell } from "@/components/page-shell";
import { useI18n } from "@/lib/i18n/context";

interface Account {
  id: string;
  username: string;
  email: string | null;
  emailVerified: boolean;
  password: string;
  displayName: string | null;
  bio: string | null;
  avatarPath: string | null;
  status: string;
  mutualFriendsCount: number;
  friendRequestsSentCount: number;
  lastActive: string | null;
  group?: { id: string; name: string; color: string } | null;
  proxy?: { id: string; name: string } | null;
}

interface Group {
  id: string;
  name: string;
}

interface Proxy {
  id: string;
  name: string;
}

const MAX_CREATE_COUNT = 50;
const COUNT_PRESETS = [1, 3, 5, 10, 20, 50] as const;

function clampCreateCount(value: number): number {
  return Math.min(MAX_CREATE_COUNT, Math.max(1, value));
}

const emptyForm = {
  username: "",
  email: "",
  password: "",
  displayName: "",
  bio: "",
  avatarPath: "",
  groupId: "",
  proxyId: "",
  autoRegister: true,
};

export default function AccountsPage() {
  const { t, locale } = useI18n();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [createCount, setCreateCount] = useState(1);
  const [countDraft, setCountDraft] = useState("1");
  const [bulkPreview, setBulkPreview] = useState<
    Array<{ displayName: string; username: string; password: string }>
  >([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/groups").then((r) => r.json()),
      fetch("/api/proxies").then((r) => r.json()),
    ]).then(([a, g, p]) => {
      setAccounts(a);
      setGroups(g);
      setProxies(p);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const refreshBulkPreview = (count: number) => {
    const taken = new Set(accounts.map((a) => a.username.toLowerCase()));
    setBulkPreview(generateWomanAccounts(count, taken));
  };

  const applyCreateCount = (next: number) => {
    const count = clampCreateCount(next);
    setCreateCount(count);
    setCountDraft(String(count));
    refreshBulkPreview(count);
  };

  const openCreate = () => {
    applyCreateCount(1);
    setForm({ ...emptyForm, autoRegister: true });
    setEditing(null);
    setAvatarError(null);
    setModal("create");
  };

  const onCountDraftChange = (raw: string) => {
    setCountDraft(raw.replace(/[^\d]/g, ""));
  };

  const commitCountDraft = () => {
    const parsed = Number(countDraft);
    applyCreateCount(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
  };

  const adjustCreateCount = (delta: number) => {
    applyCreateCount(createCount + delta);
  };

  const openEdit = (acc: Account) => {
    setAvatarError(null);
    setEditing(acc);
    setForm({
      username: acc.username,
      email: acc.email ?? "",
      password: acc.password,
      displayName: acc.displayName ?? "",
      bio: acc.bio ?? "",
      avatarPath: acc.avatarPath ?? "",
      groupId: acc.group?.id ?? "",
      proxyId: acc.proxy?.id ?? "",
      autoRegister: true,
    });
    setModal("edit");
  };

  const uploadAvatar = async (file: File) => {
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads/avatar", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Upload failed");
      }
      setForm((prev) => ({ ...prev, avatarPath: data.avatarPath }));
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setAvatarUploading(false);
    }
  };

  const avatarPreviewUrl = form.avatarPath ? avatarPublicUrl(form.avatarPath) : null;

  const regeneratePreview = () => {
    refreshBulkPreview(createCount);
  };

  const save = async () => {
    if (modal === "create") {
      const count = clampCreateCount(Number(countDraft) || createCount);
      if (count !== createCount) {
        applyCreateCount(count);
      }

      setCreating(true);
      try {
        const res = await fetch("/api/accounts/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            count,
            groupId: form.groupId || undefined,
            proxyId: form.proxyId || undefined,
            autoRegister: form.autoRegister,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok && !data.created?.length) {
          alert(formatApiError(data, t("accounts.saveFailed")));
          return;
        }
        const created = data.created?.length ?? 0;
        const failed = data.failed?.length ?? 0;
        if (failed > 0) {
          alert(t("accounts.bulkPartial", { created, failed }));
        } else {
          alert(
            created === 1
              ? t("accounts.singleCreated")
              : t("accounts.bulkCreated", { count: created })
          );
        }
      } finally {
        setCreating(false);
      }
    } else if (editing) {
      const res = await fetch(`/api/accounts/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          displayName: form.displayName || undefined,
          bio: form.bio || undefined,
          avatarPath: form.avatarPath || undefined,
          groupId: form.groupId || null,
          proxyId: form.proxyId || null,
          syncProfile: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(formatApiError(data, t("accounts.saveFailed")));
        return;
      }
      if (data.syncQueued) {
        alert(t("accounts.profileSyncQueued", { username: editing.username }));
      }
    }
    setModal(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm(t("accounts.deleteConfirm"))) return;
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    load();
  };

  const bulkWarmup = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "WARMUP_SCROLL", accountIds: ids, payload: { durationMinutes: 5 } }),
    });
    setSelected(new Set());
    alert(t("accounts.warmupQueued", { count: ids.length }));
  };

  const registerAccount = async (acc: Account) => {
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "REGISTER", accountId: acc.id }),
    });
    alert(t("accounts.registerQueued", { username: acc.username }));
    load();
  };

  const verifyEmail = async (acc: Account) => {
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "VERIFY_EMAIL", accountId: acc.id }),
    });
    alert(t("accounts.verifyQueued", { username: acc.username }));
    load();
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllAccounts = () => {
    setSelected(new Set(accounts.map((acc) => acc.id)));
  };

  const clearSelection = () => {
    setSelected(new Set());
  };

  const allSelected = accounts.length > 0 && selected.size === accounts.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <PageShell size="xl">
      <PageHeader
        title={t("accounts.title")}
        subtitle={t("accounts.subtitle")}
        actions={
          <>
            {accounts.length > 0 && (
              <>
                <Button variant="ghost" size="sm" onClick={selectAllAccounts}>
                  {t("common.selectAll")}
                </Button>
                {selected.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearSelection}>
                    {t("common.clear")}
                  </Button>
                )}
              </>
            )}
            {selected.size > 0 && (
              <Button variant="secondary" size="sm" onClick={bulkWarmup}>
                <Flame size={14} /> {t("accounts.warmup")} {selected.size}
              </Button>
            )}
            <Button size="sm" onClick={openCreate}>
              <Plus size={14} /> {t("accounts.addAccount")}
            </Button>
          </>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="px-5 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={() => (allSelected ? clearSelection() : selectAllAccounts())}
                    className="ui-checkbox"
                    aria-label={t("common.selectAll")}
                  />
                </th>
                <th>{t("common.username")}</th>
                <th>{t("accounts.group")}</th>
                <th>{t("accounts.proxy")}</th>
                <th>{t("common.status")}</th>
                <th>{t("accountDetail.mutualFriends")}</th>
                <th>{t("accountDetail.friendRequestsSent")}</th>
                <th>{t("accounts.lastActive")}</th>
                <th className="w-32" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(acc.id)}
                      onChange={() => toggleSelect(acc.id)}
                      className="ui-checkbox"
                    />
                  </td>
                  <td className="font-medium">
                    <Link
                      href={`/accounts/${acc.id}`}
                      className="hover:text-accent transition-colors"
                    >
                      {acc.username}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    {acc.group ? (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: acc.group.color }}
                        />
                        {acc.group.name}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-text-secondary">
                    {acc.proxy?.name ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    <Badge status={acc.status} />
                  </td>
                  <td className="px-5 py-3 tabular-nums text-text-secondary">
                    {acc.mutualFriendsCount}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-text-secondary">
                    {acc.friendRequestsSentCount}
                  </td>
                  <td className="px-5 py-3 text-text-muted text-xs">
                    {formatDate(acc.lastActive, locale)}
                  </td>
                  <td>
                    <div className="flex gap-0.5 items-center">
                      {accountNeedsCaptcha(acc.status) && (
                        <CaptchaSolverActions accountId={acc.id} onDone={load} />
                      )}
                      {accountNeedsRecovery(acc.status) && (
                        <AccountErrorRecovery
                          accountId={acc.id}
                          username={acc.username}
                          onResolved={load}
                          size="sm"
                          variant="primary"
                        />
                      )}
                      {acc.status !== "ACTIVE" &&
                        !accountNeedsRecovery(acc.status) &&
                        !accountNeedsCaptcha(acc.status) && (
                        <IconButton
                          label={t("accounts.registerTitle")}
                          tone="accent"
                          onClick={() => registerAccount(acc)}
                        >
                          <LogIn size={14} />
                        </IconButton>
                      )}
                      {acc.status === "ACTIVE" && !acc.emailVerified && (
                        <IconButton
                          label={t("accounts.verifyEmailTitle")}
                          tone="accent"
                          onClick={() => verifyEmail(acc)}
                        >
                          <MailCheck size={14} />
                        </IconButton>
                      )}
                      <IconButton label={t("common.edit")} onClick={() => openEdit(acc)}>
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton label={t("common.delete")} tone="danger" onClick={() => remove(acc.id)}>
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {!accounts.length && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-text-muted">
                    {t("accounts.noAccounts")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={modal === "create" || modal === "edit"}
        onClose={() => setModal(null)}
        title={
          modal === "create"
            ? createCount === 1
              ? t("accounts.newAccount")
              : t("accounts.addAccounts", { count: createCount })
            : t("accounts.editAccount")
        }
        wide
      >
        <div className="grid grid-cols-2 gap-4">
          {modal === "create" && (
            <div className="col-span-2 rounded-xl border border-border bg-surface-overlay/40 p-4">
              <label className="text-sm font-medium text-text-primary mb-3 block">
                {t("accounts.accountCount")}
              </label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0 px-2.5"
                  disabled={createCount <= 1}
                  onClick={() => adjustCreateCount(-1)}
                  aria-label={t("accounts.decreaseCount")}
                >
                  <Minus size={14} />
                </Button>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="text-center text-lg font-semibold tabular-nums max-w-[5rem]"
                  value={countDraft}
                  onChange={(e) => onCountDraftChange(e.target.value)}
                  onBlur={commitCountDraft}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitCountDraft();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0 px-2.5"
                  disabled={createCount >= MAX_CREATE_COUNT}
                  onClick={() => adjustCreateCount(1)}
                  aria-label={t("accounts.increaseCount")}
                >
                  <Plus size={14} />
                </Button>
                <span className="text-sm text-text-secondary ml-1">
                  {t("accounts.accountCountMax", { max: MAX_CREATE_COUNT })}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {COUNT_PRESETS.map((preset) => (
                  <Chip
                    key={preset}
                    active={createCount === preset}
                    onClick={() => applyCreateCount(preset)}
                  >
                    {preset}
                  </Chip>
                ))}
              </div>
              <p className="text-[11px] text-text-muted mt-3">{t("accounts.accountCountHint")}</p>
            </div>
          )}

          {modal === "create" ? (
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-text-muted">{t("accounts.bulkPreview")}</label>
                <Button variant="secondary" size="sm" type="button" onClick={regeneratePreview}>
                  <Sparkles size={14} />
                  {t("accounts.regeneratePreview")}
                </Button>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-text-muted bg-surface-overlay grid grid-cols-3 gap-2">
                  <span>{t("common.username")}</span>
                  <span>{t("accounts.displayName")}</span>
                  <span>{t("common.password")}</span>
                </div>
                <div className="max-h-48 overflow-y-auto ui-list rounded-xl border border-border/80 overflow-hidden">
                  {bulkPreview.map((row) => (
                    <div
                      key={row.username}
                      className="px-3 py-2 text-xs grid grid-cols-3 gap-2"
                    >
                      <span className="font-mono text-accent">{row.username}</span>
                      <span className="text-text-secondary">{row.displayName}</span>
                      <span className="font-mono text-text-muted truncate">{row.password}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-text-muted mt-2">{t("accounts.emailAutoHint")}</p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-text-muted mb-1 block">{t("common.username")}</label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">{t("accounts.displayName")}</label>
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">{t("common.email")}</label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">{t("common.password")}</label>
                <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-text-muted mb-1 block">{t("accounts.bio")}</label>
                <textarea
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 min-h-[80px]"
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-text-muted mb-2 block">{t("accounts.avatar")}</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-surface-overlay border border-border-subtle overflow-hidden flex items-center justify-center shrink-0">
                    {avatarPreviewUrl ? (
                      <img src={avatarPreviewUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImagePlus size={20} className="text-text-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface text-sm cursor-pointer hover:bg-surface-overlay transition-colors">
                      <ImagePlus size={14} />
                      {avatarUploading ? t("accounts.avatarUploading") : t("accounts.avatarChoose")}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        disabled={avatarUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadAvatar(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {form.avatarPath && (
                      <p className="text-xs text-text-muted mt-1.5 truncate">{form.avatarPath}</p>
                    )}
                    {avatarError && (
                      <p className="text-xs text-status-error mt-1.5">{avatarError}</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t("accounts.group")}</label>
            <Select
              value={form.groupId}
              onChange={(e) => setForm({ ...form, groupId: e.target.value })}
            >
              <option value="">{t("common.none")}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t("accounts.proxyVpn")}</label>
            <Select
              value={form.proxyId}
              onChange={(e) => setForm({ ...form, proxyId: e.target.value })}
            >
              <option value="">{t("accounts.directConnection")}</option>
              {proxies.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          {modal === "create" && (
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="autoRegister"
                checked={form.autoRegister}
                onChange={(e) => setForm({ ...form, autoRegister: e.target.checked })}
              />
              <label htmlFor="autoRegister" className="text-sm text-text-secondary">
                {t("accounts.autoRegister")}
              </label>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => setModal(null)}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={(modal === "edit" && avatarUploading) || creating}>
            {modal === "edit"
              ? t("accounts.saveSync")
              : creating
                ? t("accounts.bulkCreating", { current: "…", total: createCount })
                : createCount > 1
                  ? `${t("common.create")} ${createCount}`
                  : t("common.create")}
          </Button>
        </div>
      </Modal>

    </PageShell>
  );
}