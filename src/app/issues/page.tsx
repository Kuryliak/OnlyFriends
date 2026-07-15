"use client";

import { Suspense } from "react";
import IssuesPageContent from "./issues-content";

export default function IssuesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-text-muted">Loading…</div>}>
      <IssuesPageContent />
    </Suspense>
  );
}