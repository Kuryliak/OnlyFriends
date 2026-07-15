"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/lib/i18n/context";

type RecoverFailure = {
  error: string;
  status?: string;
  captcha?: boolean;
};

export function AccountErrorRecovery({
  accountId,
  username,
  onResolved,
  size = "sm",
  variant = "secondary",
}: {
  accountId: string;
  username?: string;
  onResolved?: () => void;
  size?: "sm" | "md";
  variant?: "secondary" | "primary";
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [recovering, setRecovering] = useState(false);
  const [failure, setFailure] = useState<RecoverFailure | null>(null);
  const [keeping, setKeeping] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const recover = async () => {
    setRecovering(true);
    setFailure(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/recover`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        onResolved?.();
        return;
      }
      setFailure({
        error: data.error ?? t("accountRecovery.failedGeneric"),
        status: data.status,
        captcha: data.captcha,
      });
    } catch {
      setFailure({ error: t("accountRecovery.failedGeneric") });
    } finally {
      setRecovering(false);
    }
  };

  const keepForManualFix = async () => {
    setKeeping(true);
    try {
      await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IDLE" }),
      });
      setFailure(null);
      onResolved?.();
      if (pathname !== `/accounts/${accountId}`) {
        router.push(`/accounts/${accountId}`);
      }
    } finally {
      setKeeping(false);
    }
  };

  const deleteAccount = async () => {
    if (!confirm(t("accountRecovery.deleteConfirm", { username: username ?? "—" }))) return;
    setDeleting(true);
    try {
      await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
      setFailure(null);
      onResolved?.();
      router.push("/accounts");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button
        size={size}
        variant={variant}
        disabled={recovering}
        onClick={() => void recover()}
      >
        <Wrench size={14} className={recovering ? "animate-spin" : ""} />
        {recovering ? t("accountRecovery.fixing") : t("accountRecovery.fix")}
      </Button>

      <Modal
        open={Boolean(failure)}
        onClose={() => setFailure(null)}
        title={t("accountRecovery.failedTitle")}
        footer={
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button
              variant="secondary"
              size="sm"
              disabled={keeping || deleting}
              onClick={() => void keepForManualFix()}
            >
              {keeping ? t("accountRecovery.keeping") : t("accountRecovery.keepManual")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-status-error hover:text-status-error"
              disabled={keeping || deleting}
              onClick={() => void deleteAccount()}
            >
              {deleting ? t("accountRecovery.deleting") : t("accountRecovery.delete")}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          {username ? (
            <p className="text-text-secondary">
              {t("accountRecovery.accountLabel")}{" "}
              <span className="font-mono text-accent">{username}</span>
            </p>
          ) : null}
          <p className="text-status-error leading-relaxed">{failure?.error}</p>
          {failure?.captcha ? (
            <p className="text-text-secondary text-xs leading-relaxed">
              {t("accountRecovery.captchaHint")}{" "}
              <Link href="/jobs" className="text-accent hover:underline">
                {t("nav.jobs")}
              </Link>
            </p>
          ) : (
            <p className="text-text-secondary text-xs leading-relaxed">
              {t("accountRecovery.manualHint")}
            </p>
          )}
          <p className="text-[11px] text-text-muted leading-relaxed">
            {t("accountRecovery.whyError")}
          </p>
        </div>
      </Modal>
    </>
  );
}