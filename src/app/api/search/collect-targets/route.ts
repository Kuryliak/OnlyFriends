import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  collectProfileTargets,
  type CollectProgress,
} from "@/lib/automation/tasks/profile-search";
import type { ProfileSearchFilters } from "@/lib/profile-search/filters";
import { z } from "zod";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const schema = z.object({
  count: z.number().int().min(1).max(500),
  accountId: z.string().optional(),
  filters: z.record(z.unknown()),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { count, accountId, filters } = parsed.data;

  let account = null;
  if (accountId) {
    account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { proxy: true },
    });
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const send = (payload: object) =>
    writer.write(encoder.encode(`${JSON.stringify(payload)}\n`));

  void (async () => {
    try {
      const result = await collectProfileTargets(
        filters as ProfileSearchFilters,
        count,
        account,
        account?.proxy ?? null,
        {
          onProgress: (progress: CollectProgress) => {
            void send({ type: "progress", ...progress });
          },
        }
      );

      if (!result.success) {
        await send({ type: "error", error: result.error, captcha: result.captcha });
      } else {
        await send({ type: "done", ...result });
      }
    } catch (err) {
      await send({
        type: "error",
        error: err instanceof Error ? err.message : "Collection failed",
      });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}