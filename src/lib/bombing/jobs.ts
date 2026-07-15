import type { JobResponse, JobType } from "./types";

export async function postBombingJob(
  type: JobType,
  ids: string[],
  targets: string[],
  extraPayload?: Record<string, unknown>
): Promise<JobResponse> {
  const payload = { targets, ...extraPayload };
  const body =
    ids.length > 1
      ? { type, accountIds: ids, payload }
      : { type, accountId: ids[0], payload };

  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as JobResponse & {
    error?: string | { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
  };

  if (!res.ok) {
    const message =
      typeof data.error === "string"
        ? data.error
        : data.error?.formErrors?.[0] ?? "Failed to queue jobs";
    throw new Error(message);
  }

  return data;
}

/** Friends first; subscribe is queued automatically after each friends job completes. */
export async function queueBombingJobs(ids: string[], targets: string[]) {
  return postBombingJob("ADD_FRIENDS", ids, targets, { chainSubscribe: true });
}