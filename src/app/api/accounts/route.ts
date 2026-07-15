import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { kickJobProcessor } from "@/lib/jobs/trigger";
import { getDefaultProxy } from "@/lib/proxy/env";
import { emptyToUndefined } from "@/lib/api/sanitize";
import { provisionTempEmailForAccount } from "@/lib/temp-mail/provision";
import { z } from "zod";

const optionalEmail = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().email().optional()
);

const createSchema = z.object({
  username: z.string().min(3),
  email: optionalEmail,
  password: z.string().min(6),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  avatarPath: z.string().optional(),
  groupId: z.string().optional(),
  proxyId: z.string().optional(),
  autoRegister: z.boolean().optional(),
});

function formatZodError(error: z.ZodError) {
  const flat = error.flatten();
  const firstField = Object.entries(flat.fieldErrors).find(([, msgs]) => msgs?.length)?.[1]?.[0];
  return firstField ?? flat.formErrors[0] ?? "Invalid form data";
}

export async function GET() {
  const accounts = await prisma.account.findMany({
    include: { group: true, proxy: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createSchema.safeParse(emptyToUndefined(body));
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatZodError(parsed.error), details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { autoRegister, ...accountData } = parsed.data;
  const defaultProxy = !accountData.proxyId ? await getDefaultProxy() : null;

  let email = accountData.email;
  let emailPassword: string | undefined;
  if (!email) {
    try {
      const inbox = await provisionTempEmailForAccount(accountData.username);
      email = inbox.email;
      emailPassword = inbox.emailPassword;
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : "Failed to create temporary email inbox",
        },
        { status: 502 }
      );
    }
  }

  let account;
  try {
    account = await prisma.account.create({
      data: {
        ...accountData,
        email,
        emailPassword,
        emailVerified: false,
        proxyId: accountData.proxyId ?? defaultProxy?.id,
      },
      include: { group: true, proxy: true },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Username already exists — pick a different username" },
        { status: 409 }
      );
    }
    throw err;
  }

  if (autoRegister !== false) {
    const job = await prisma.job.create({
      data: {
        type: "REGISTER",
        accountId: account.id,
        payload: "{}",
      },
    });
    kickJobProcessor(job.id);
  }

  return NextResponse.json(account, { status: 201 });
}