"use client";

import { NotificationProvider } from "@/components/notification-provider";
import { I18nProvider } from "@/lib/i18n/context";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <NotificationProvider>{children}</NotificationProvider>
    </I18nProvider>
  );
}