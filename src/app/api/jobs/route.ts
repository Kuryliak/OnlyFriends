import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { kickJobProcessor } from "@/lib/jobs/trigger";
import { createDistributedFriendJobs, createFriendJobs } from "@/lib/friends/jobs";
import {
  createDistributedSubscribeJobs,
  createSubscribeJob,
} from "@/lib/subscribers/jobs";
import { z } from "zod";

const schema = z.object({
  type: z.enum([
    "REGISTER",
    "VERIFY_EMAIL",
    "UPDATE_PROFILE",
    "ADD_FRIENDS",
    "SUBSCRIBE",
    "SEND_MESSAGE",
    "WARMUP_SCROLL",
    "LOGIN",
  ]),
  accountId: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  accountIds: z.array(z.string()).optional(),
});

export async function GET() {
  const jobs = await prisma.job.findMany({
    include: { account: { select: { id: true, username: true, status: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { type, accountId, payload, accountIds } = parsed.data;
  const payloadData = payload ?? {};

  if (
    type === "ADD_FRIENDS" &&
    accountIds?.length &&
    Array.isArray(payloadData.targets) &&
    payloadData.targets.length
  ) {
    const targets = payloadData.targets.filter((t): t is string => typeof t === "string");
    const chainSubscribe = payloadData.chainSubscribe === true;
    const result = await createDistributedFriendJobs(accountIds, targets, { chainSubscribe });
    return NextResponse.json(result, { status: 201 });
  }

  if (
    type === "SUBSCRIBE" &&
    accountIds?.length &&
    Array.isArray(payloadData.targets) &&
    payloadData.targets.length
  ) {
    const targets = payloadData.targets.filter((t): t is string => typeof t === "string");
    const result = await createDistributedSubscribeJobs(accountIds, targets);
    return NextResponse.json(result, { status: 201 });
  }

  const payloadStr = JSON.stringify(payloadData);

  if (accountIds?.length) {
    const jobs = await Promise.all(
      accountIds.map((id) =>
        prisma.job.create({
          data: { type, accountId: id, payload: payloadStr },
        })
      )
    );
    kickJobProcessor(jobs[0]?.id);
    return NextResponse.json(jobs, { status: 201 });
  }

  if (type === "ADD_FRIENDS" && accountId && Array.isArray(payloadData.targets)) {
    const targets = payloadData.targets.filter((t): t is string => typeof t === "string");
    const chainSubscribe = payloadData.chainSubscribe === true;
    const { job, batchId } = await createFriendJobs(accountId, targets, { chainSubscribe });
    return NextResponse.json({ ...job, batchId }, { status: 201 });
  }

  if (type === "SUBSCRIBE" && accountId && Array.isArray(payloadData.targets)) {
    const targets = payloadData.targets.filter((t): t is string => typeof t === "string");
    const job = await createSubscribeJob(accountId, targets);
    return NextResponse.json(job, { status: 201 });
  }

  const job = await prisma.job.create({
    data: { type, accountId, payload: payloadStr },
  });
  kickJobProcessor(job.id);
  return NextResponse.json(job, { status: 201 });
}