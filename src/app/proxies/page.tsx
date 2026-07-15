"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader, PageShell } from "@/components/page-shell";
import { useI18n } from "@/lib/i18n/context";

interface Proxy {
  id: string;
  name: string;
  host: string;
  port: number;
  type: string;
  username: string | null;
  country: string | null;
  isActive: boolean;
  _count: { accounts: number };
}

const empty = {
  name: "",
  host: "",
  port: "8080",
  type: "HTTP",
  username: "",
  password: "",
  country: "",
};

export default function ProxiesPage() {
  const { t } = useI18n();
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const load = () => fetch("/api/proxies").then((r) => r.json()).then(setProxies);
  useEffect(() => { load(); }, []);

  const create = async () => {
    await fetch("/api/proxies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        port: parseInt(form.port, 10),
        username: form.username || undefined,
        password: form.password || undefined,
        country: form.country || undefined,
      }),
    });
    setOpen(false);
    setForm(empty);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm(t("proxies.deleteConfirm"))) return;
    await fetch(`/api/proxies/${id}`, { method: "DELETE" });
    load();
  };

  const testProxyConn = async (proxy: Proxy) => {
    setTestingId(proxy.id);
    try {
      const res = await fetch("/api/proxies/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: proxy.id }),
      });
      const data = await res.json();
      if (data.ok) {
        const xv = data.xvideosReachable
          ? ` · XVIDEOS OK (${data.xvideosMs ?? "?"}ms)`
          : " · XVIDEOS unreachable";
        alert(t("proxies.testOk", { ip: data.ip, ms: data.elapsedMs }) + xv);
      } else {
        alert(t("proxies.testFail", { error: data.error ?? "unknown" }));
      }
    } finally {
      setTestingId(null);
    }
  };

  const toggle = async (proxy: Proxy) => {
    await fetch(`/api/proxies/${proxy.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !proxy.isActive }),
    });
    load();
  };

  const assignToAll = async (proxy: Proxy) => {
    if (!confirm(t("proxies.assignAllConfirm", { name: proxy.name }))) return;
    setAssigningId(proxy.id);
    try {
      const res = await fetch(`/api/proxies/${proxy.id}/assign-all`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(t("proxies.assignAllFail", { error: data.error ?? "unknown" }));
        return;
      }
      alert(t("proxies.assignAllOk", { count: data.updated }));
      load();
    } catch (err) {
      alert(
        t("proxies.assignAllFail", {
          error: err instanceof Error ? err.message : "unknown",
        })
      );
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <PageShell size="lg">
      <PageHeader
        title={t("proxies.title")}
        subtitle={t("proxies.subtitle")}
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus size={14} /> {t("proxies.addProxy")}
          </Button>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("proxies.endpoint")}</th>
                <th>{t("proxies.type")}</th>
                <th>{t("common.country")}</th>
                <th>{t("nav.accounts")}</th>
                <th>{t("common.status")}</th>
                <th className="w-56" />
              </tr>
            </thead>
            <tbody>
              {proxies.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td className="font-mono text-xs text-text-secondary">
                    {p.host}:{p.port}
                  </td>
                  <td className="px-5 py-3">
                    <Badge status={p.type} />
                  </td>
                  <td className="px-5 py-3 text-text-muted">{p.country ?? "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{p._count.accounts}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => toggle(p)}>
                      <Badge status={p.isActive ? "ACTIVE" : "IDLE"} />
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={testingId === p.id}
                        onClick={() => testProxyConn(p)}
                      >
                        {testingId === p.id ? t("proxies.testing") : t("proxies.test")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={assigningId === p.id}
                        onClick={() => assignToAll(p)}
                        title={t("proxies.assignAll")}
                      >
                        <Users size={14} />
                        {assigningId === p.id
                          ? t("proxies.assigningAll")
                          : t("proxies.assignAll")}
                      </Button>
                      <IconButton label={t("common.delete")} tone="danger" onClick={() => remove(p.id)}>
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {!proxies.length && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-text-muted">
                    <p>{t("proxies.empty")}</p>
                    <p className="text-xs mt-2 font-mono">{t("proxies.envHint")}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t("proxies.addProxy")} wide>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t("common.name")}</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("proxies.namePlaceholder")} />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t("proxies.type")}</label>
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="HTTP">HTTP</option>
              <option value="HTTPS">HTTPS</option>
              <option value="SOCKS5">SOCKS5</option>
            </Select>
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t("proxies.host")}</label>
            <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t("proxies.port")}</label>
            <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t("common.username")}</label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t("common.password")}</label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-text-muted mb-1 block">{t("common.country")}</label>
            <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder={t("proxies.countryPlaceholder")} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={create}>{t("common.add")}</Button>
        </div>
      </Modal>
    </PageShell>
  );
}