import { NextRequest, NextResponse } from "next/server";
import { resumeAfterCaptcha } from "@/lib/captcha/resume";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await resumeAfterCaptcha(id);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json(result);
}