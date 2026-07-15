import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { kickJobProcessor } from "@/lib/jobs/trigger";
import { getDefaultProxy } from "@/lib/proxy/env";
import { generateWomanAccounts } from "@/lib/accounts/generate-credentials";
import { provisionTempEmailForAccount } from "@/lib/temp-mail/provision";
import { z } from "zod";

const schema = z.object({
  count: z.number().int().min(1).max(50),
  groupId: z.string().optional(),
  proxyId: z.string().optional(),
  autoRegister: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { count, groupId, proxyId, autoRegister = true } = parsed.data;
  const defaultProxy = !proxyId ? await getDefaultProxy() : null;

  const existing = await prisma.account.findMany({ select: { username: true } });
  const taken = new Set(existing.map((a) => a.username.toLowerCase()));
  const drafts = generateWomanAccounts(count, taken);

  const created: Array<{ id: string; username: string; displayName: string | null }> = [];
  const failed: Array<{ username: string; error: string }> = [];

  for (const draft of drafts) {
    let email: string | undefined;
    let emailPassword: string | undefined;

    try {
      const inbox = await provisionTempEmailForAccount(draft.username);
      email = inbox.email;
      emailPassword = inbox.emailPassword;
    } catch (err) {
      failed.push({
        username: draft.username,
        error:
          err instanceof Error ? err.message : "Failed to create temporary email inbox",
      });
      continue;
    }

    try {
      const account = await prisma.account.create({
        data: {
          username: draft.username,
          displayName: draft.displayName,
          sex: "Woman",
          password: draft.password,
          email,
          emailPassword,
          emailVerified: false,
          groupId: groupId || undefined,
          proxyId: proxyId ?? defaultProxy?.id,
        },
      });

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

      created.push({
        id: account.id,
        username: account.username,
        displayName: account.displayName,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        failed.push({
          username: draft.username,
          error: "Username already exists",
        });
      } else {
        failed.push({
          username: draft.username,
          error: err instanceof Error ? err.message : "Create failed",
        });
      }
    }
  }

  return NextResponse.json(
    {
      created,
      failed,
      queuedRegistration: autoRegister !== false ? created.length : 0,
    },
    { status: created.length ? 201 : 400 }
  );
}