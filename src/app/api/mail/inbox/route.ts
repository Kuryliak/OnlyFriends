import { NextResponse } from "next/server";
import { createInbox } from "@/lib/temp-mail/mailtm";

export async function POST() {
  try {
    const inbox = await createInbox();
    return NextResponse.json({ success: true, inbox });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to create inbox",
      },
      { status: 502 }
    );
  }
}