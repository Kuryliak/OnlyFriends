"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PageHeader, PageShell } from "@/components/page-shell";
import { useI18n } from "@/lib/i18n/context";

interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  _count: { accounts: number };
}

export default function GroupsPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", color: "#e85d4c" });

  const load = () => fetch("/api/groups").then((r) => r.json()).then(setGroups);
  useEffect(() => { load(); }, []);

  const create = async () => {
    await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setOpen(false);
    setForm({ name: "", description: "", color: "#e85d4c" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm(t("groups.deleteConfirm"))) return;
    await fetch(`/api/groups/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <PageShell size="md">
      <PageHeader
        title={t("groups.title")}
        subtitle={t("groups.subtitle")}
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus size={14} /> {t("groups.newGroup")}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.id} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: g.color }}
                />
                <div>
                  <h3 className="font-medium">{g.name}</h3>
                  {g.description && (
                    <p className="text-xs text-text-muted mt-0.5">{g.description}</p>
                  )}
                </div>
              </div>
              <IconButton label={t("common.delete")} tone="danger" onClick={() => remove(g.id)}>
                <Trash2 size={14} />
              </IconButton>
            </div>
            <p className="mt-4 text-2xl font-display font-semibold tabular-nums">
              {g._count.accounts}
              <span className="text-xs text-text-muted font-body font-normal ml-2">{t("common.accounts")}</span>
            </p>
          </Card>
        ))}
        {!groups.length && (
          <Card className="p-12 col-span-2 text-center text-text-muted text-sm">
            {t("groups.empty")}
          </Card>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t("groups.newGroup")}>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t("common.name")}</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t("common.description")}</label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">{t("common.color")}</label>
            <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={create}>{t("common.create")}</Button>
        </div>
      </Modal>
    </PageShell>
  );
}