import { NextRequest, NextResponse } from "next/server";
import { getMessage } from "@/lib/temp-mail/mailtm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Missing mail token" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const message = await getMessage(token, id);
    return NextResponse.json({ success: true, message });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load message",
      },
      { status: 502 }
    );
  }
}