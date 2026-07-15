"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  FolderOpen,
  Globe,
  ListTodo,
  LayoutDashboard,
  Search,
  Mail,
  Cpu,
  BarChart3,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";

type NavItem = {
  href: string;
  key: string;
  icon: typeof LayoutDashboard;
  badgeKey?: "captcha";
};

const navSections: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: "nav.sectionMain",
    items: [
      { href: "/", key: "nav.dashboard", icon: LayoutDashboard },
      { href: "/stats", key: "nav.stats", icon: BarChart3 },
      { href: "/accounts", key: "nav.accounts", icon: Users },
      { href: "/search", key: "nav.search", icon: Search },
    ],
  },
  {
    labelKey: "nav.sectionOps",
    items: [
      { href: "/captcha", key: "nav.captcha", icon: ShieldAlert, badgeKey: "captcha" },
      { href: "/jobs", key: "nav.jobs", icon: ListTodo },
      { href: "/mail", key: "nav.mail", icon: Mail },
    ],
  },
  {
    labelKey: "nav.sectionSystem",
    items: [
      { href: "/groups", key: "nav.groups", icon: FolderOpen },
      { href: "/proxies", key: "nav.proxies", icon: Globe },
      { href: "/workers", key: "nav.workers", icon: Cpu },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [captchaCount, setCaptchaCount] = useState(0);

  useEffect(() => {
    const load = () =>
      fetch("/api/captcha/pending")
        .then((r) => r.json())
        .then((data) => setCaptchaCount(data.count ?? 0))
        .catch(() => {});
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside
      className={cn(
        "w-60 shrink-0 flex flex-col border-r border-border/60",
        "bg-surface-raised/80 backdrop-blur-xl shadow-sidebar"
      )}
    >
      <div className="px-5 py-6 border-b border-border-subtle/70">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-2xl",
              "bg-gradient-to-br from-accent/25 to-accent/5 border border-accent/25",
              "shadow-[0_0_24px_rgba(240,107,90,0.15)]"
            )}
          >
            <Sparkles size={18} className="text-accent" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-base font-semibold tracking-tight leading-tight">
              Only<span className="text-gradient-accent">Friends</span>
            </h1>
            <p className="text-[10px] text-text-muted mt-0.5 truncate">{t("nav.tagline")}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-5">
        {navSections.map(({ labelKey, items }) => (
          <div key={labelKey}>
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted/80">
              {t(labelKey)}
            </p>
            <div className="space-y-0.5">
              {items.map(({ href, key, icon: Icon, badgeKey }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                const badge = badgeKey === "captcha" && captchaCount > 0 ? captchaCount : null;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "group flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] transition-all duration-200 border",
                      active
                        ? "bg-accent/12 text-accent font-medium border-accent/20 shadow-[inset_3px_0_0_0_rgba(240,107,90,0.95)]"
                        : badge
                          ? "text-status-pending border-status-pending/20 bg-status-pending/[0.06] hover:bg-status-pending/10"
                          : "text-text-secondary border-transparent hover:text-text-primary hover:bg-surface-overlay/60 hover:border-border-subtle/50"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                        active
                          ? "bg-accent/15 text-accent"
                          : "bg-surface-overlay/40 text-text-muted group-hover:text-text-secondary"
                      )}
                    >
                      <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
                    </span>
                    <span className="flex-1 truncate">{t(key)}</span>
                    {badge ? (
                      <span className="min-w-[1.25rem] rounded-full bg-status-pending px-1.5 py-0.5 text-center text-[10px] font-bold text-surface tabular-nums shadow-sm">
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-border-subtle/70 bg-surface/40">
        <div className="rounded-xl border border-border-subtle/60 bg-surface-overlay/30 px-3 py-2.5">
          <p className="text-[10px] text-text-muted leading-relaxed">
            {t("nav.workerHint", { cmd: "npm run worker" })}
          </p>
        </div>
      </div>
    </aside>
  );
}