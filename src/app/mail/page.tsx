"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Mail, RefreshCw, Plus, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader, PageShell } from "@/components/page-shell";
import { useI18n } from "@/lib/i18n/context";
import {
  clearTempMailInbox,
  loadTempMailInbox,
  saveTempMailInbox,
} from "@/lib/temp-mail/storage";
import type { MailTmInbox, MailTmMessage, MailTmMessageSummary } from "@/lib/temp-mail/mailtm";
import { extractVerificationLinks } from "@/lib/temp-mail/mailtm";

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU");
}

export default function MailPage() {
  const { t } = useI18n();
  const [inbox, setInbox] = useState<MailTmInbox | null>(null);
  const [messages, setMessages] = useState<MailTmMessageSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<MailTmMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setInbox(loadTempMailInbox());
  }, []);

  const mailHeaders = useCallback(
    () => ({
      Authorization: `Bearer ${inbox?.token ?? ""}`,
    }),
    [inbox?.token]
  );

  const refreshMessages = useCallback(async () => {
    if (!inbox?.token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/messages", { headers: mailHeaders() });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? t("mail.loadFailed"));
        return;
      }
      setMessages(data.messages);
    } catch {
      setError(t("mail.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [inbox?.token, mailHeaders, t]);

  const loadMessage = useCallback(
    async (id: string) => {
      if (!inbox?.token) return;
      setSelectedId(id);
      setSelectedMessage(null);
      try {
        const res = await fetch(`/api/mail/messages/${id}`, { headers: mailHeaders() });
        const data = await res.json();
        if (data.success) setSelectedMessage(data.message);
      } catch {
        setError(t("mail.loadFailed"));
      }
    },
    [inbox?.token, mailHeaders, t]
  );

  useEffect(() => {
    if (inbox?.token) refreshMessages();
  }, [inbox?.token, refreshMessages]);

  useEffect(() => {
    if (!inbox?.token) return;
    const timer = setInterval(refreshMessages, 5000);
    return () => clearInterval(timer);
  }, [inbox?.token, refreshMessages]);

  const createInbox = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/inbox", { method: "POST" });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? t("mail.createFailed"));
        return;
      }
      saveTempMailInbox(data.inbox);
      setInbox(data.inbox);
      setMessages([]);
      setSelectedId(null);
      setSelectedMessage(null);
    } catch {
      setError(t("mail.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  const copyAddress = async () => {
    if (!inbox?.address) return;
    await navigator.clipboard.writeText(inbox.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetInbox = () => {
    clearTempMailInbox();
    setInbox(null);
    setMessages([]);
    setSelectedId(null);
    setSelectedMessage(null);
    setError(null);
  };

  const verificationLinks = selectedMessage
    ? extractVerificationLinks(
        [selectedMessage.text ?? "", ...selectedMessage.html, selectedMessage.intro].join("\n")
      )
    : [];

  return (
    <PageShell size="xl">
      <PageHeader
        title={t("mail.title")}
        subtitle={t("mail.subtitle")}
        className="mb-6"
        actions={
          <>
            {inbox && (
              <Button variant="ghost" onClick={refreshMessages} disabled={loading}>
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                {t("mail.refresh")}
              </Button>
            )}
            <Button onClick={createInbox} disabled={creating}>
              <Plus size={14} />
              {creating ? t("mail.creating") : inbox ? t("mail.newInbox") : t("mail.createInbox")}
            </Button>
          </>
        }
      />

      {!inbox ? (
        <Card className="p-10 text-center">
          <Mail size={32} className="mx-auto text-text-muted mb-4" />
          <p className="text-text-secondary text-sm mb-4">{t("mail.emptyState")}</p>
          <Button onClick={createInbox} disabled={creating}>
            <Plus size={14} /> {t("mail.createInbox")}
          </Button>
        </Card>
      ) : (
        <>
          <Card className="p-5 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-text-muted mb-1">{t("mail.currentAddress")}</p>
                <p className="font-mono text-sm">{inbox.address}</p>
                <p className="text-[11px] text-text-muted mt-2">{t("mail.hint")}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={copyAddress}>
                  <Copy size={14} />
                  {copied ? t("mail.copied") : t("mail.copy")}
                </Button>
                <Button variant="ghost" size="sm" onClick={resetInbox}>
                  <Trash2 size={14} /> {t("mail.clear")}
                </Button>
              </div>
            </div>
          </Card>

          {error && <p className="text-sm text-status-error mb-4">{error}</p>}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader title={t("mail.inbox")} />
              <div className="ui-list">
                {!messages.length && (
                  <p className="ui-list-empty">{t("mail.noMessages")}</p>
                )}
                {messages.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => loadMessage(msg.id)}
                    className={`ui-list-item ui-list-item-interactive w-full text-left ${
                      selectedId === msg.id ? "ui-list-item-selected" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm truncate">{msg.subject || t("mail.noSubject")}</p>
                      {!msg.seen && (
                        <span className="text-[10px] uppercase text-accent font-mono shrink-0">
                          {t("mail.new")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5 truncate">
                      {msg.from?.name || msg.from?.address}
                    </p>
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">{msg.intro}</p>
                    <p className="text-[11px] text-text-muted mt-1 font-mono">
                      {formatDate(msg.createdAt)}
                    </p>
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title={t("mail.message")} />
              {!selectedMessage ? (
                <p className="px-5 py-10 text-center text-text-muted text-sm">
                  {t("mail.selectMessage")}
                </p>
              ) : (
                <div className="px-5 py-4 space-y-4">
                  <div>
                    <p className="text-lg font-medium">{selectedMessage.subject || t("mail.noSubject")}</p>
                    <p className="text-xs text-text-muted mt-1">
                      {selectedMessage.from?.name || selectedMessage.from?.address} ·{" "}
                      {formatDate(selectedMessage.createdAt)}
                    </p>
                  </div>

                  {verificationLinks.length > 0 && (
                    <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
                      <p className="text-xs font-medium text-accent">{t("mail.verificationLinks")}</p>
                      {verificationLinks.map((link) => (
                        <a
                          key={link}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-accent hover:underline break-all"
                        >
                          <ExternalLink size={12} /> {link}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-surface p-3 text-sm whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
                    {selectedMessage.text ||
                      selectedMessage.html?.[0]?.replace(/<[^>]+>/g, " ") ||
                      selectedMessage.intro ||
                      t("mail.noBody")}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </PageShell>
  );
}