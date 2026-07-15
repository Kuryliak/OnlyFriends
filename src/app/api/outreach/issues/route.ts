import { NextRequest, NextResponse } from "next/server";
import { listAllOutreachIssues } from "@/lib/accounts/all-outreach-issues";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const filter =
    status === "failed" || status === "skipped" || status === "all" ? status : "all";

  const issues = await listAllOutreachIssues(filter);

  return NextResponse.json({
    issues,
    counts: {
      total: issues.length,
      failed: issues.filter((i) => i.status === "failed").length,
      skipped: issues.filter((i) => i.status === "skipped").length,
    },
  });
}