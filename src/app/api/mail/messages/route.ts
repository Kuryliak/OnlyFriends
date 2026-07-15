import { NextRequest, NextResponse } from "next/server";
import { listMessages } from "@/lib/temp-mail/mailtm";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Missing mail token" }, { status: 401 });
  }

  try {
    const messages = await listMessages(token);
    return NextResponse.json({ success: true, messages });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load messages",
      },
      { status: 502 }
    );
  }
}