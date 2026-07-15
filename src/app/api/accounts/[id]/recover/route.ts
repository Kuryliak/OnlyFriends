import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recoverErrorAccount } from "@/lib/accounts/recover-account";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const account = await prisma.account.findUnique({
    where: { id },
    include: { proxy: true },
  });

  if (!account) {
    return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });
  }

  if (account.status === "BANNED") {
    return NextResponse.json(
      {
        ok: false,
        error: "Аккаунт заблокирован на XVIDEOS — автоматическое восстановление невозможно",
        status: "BANNED",
      },
      { status: 409 }
    );
  }

  const result = await recoverErrorAccount(account);

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      status: result.status,
      message: result.message,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      status: result.status,
      error: result.error,
      captcha: result.captcha ?? false,
    },
    { status: result.captcha ? 408 : 422 }
  );
}