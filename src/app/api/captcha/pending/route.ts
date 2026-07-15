import { NextResponse } from "next/server";
import { listPendingCaptcha } from "@/lib/captcha/pending";

export async function GET() {
  const items = await listPendingCaptcha();
  return NextResponse.json({ count: items.length, items });
}