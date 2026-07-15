import type { ProfileSearchFilters } from "@/lib/profile-search/filters";

export type CollectPhaseLabel = "strict" | "broader" | "unverified" | "newProfiles";

export type CollectProgress = {
  phase: number;
  phaseTotal: number;
  phaseLabel: CollectPhaseLabel;
  page: number;
  found: number;
  requested: number;
};

export const PREVIEW_SAMPLE_LIMIT = 40;

export function buildSearchBody(
  filters: ProfileSearchFilters,
  page: number,
  searchAccountId?: string
) {
  return {
    ...filters,
    page,
    accountId: searchAccountId,
    ageMin: filters.ageMin || undefined,
    ageMax: filters.ageMax || undefined,
    createDate: filters.createDate || undefined,
  };
}

export type CollectTargetsResult = {
  targets: string[];
  pagesScanned?: number;
  phasesUsed?: number;
  widened?: boolean;
};

type StreamEvent =
  | ({ type: "progress" } & CollectProgress)
  | ({ type: "done" } & {
      success: true;
      targets: string[];
      pagesScanned: number;
      phasesUsed: number;
      widened: boolean;
    })
  | { type: "error"; error: string; captcha?: boolean };

async function readCollectStream(
  response: Response,
  onProgress?: (progress: CollectProgress) => void
): Promise<CollectTargetsResult> {
  if (!response.body) {
    throw new Error("Empty response from collect-targets");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: CollectTargetsResult | null = null;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as StreamEvent;

      if (event.type === "progress") {
        onProgress?.({
          phase: event.phase,
          phaseTotal: event.phaseTotal,
          phaseLabel: event.phaseLabel,
          page: event.page,
          found: event.found,
          requested: event.requested,
        });
      } else if (event.type === "done") {
        result = {
          targets: event.targets ?? [],
          pagesScanned: event.pagesScanned,
          phasesUsed: event.phasesUsed,
          widened: event.widened,
        };
      } else if (event.type === "error") {
        streamError = event.error ?? "Failed to collect targets";
      }
    }
  }

  if (streamError) throw new Error(streamError);
  if (!result) throw new Error("Collection ended without results");
  return result;
}

export async function collectSearchTargets(options: {
  count: number;
  mode: "search" | "selected";
  selectedProfiles: string[];
  filters: ProfileSearchFilters;
  searchAccountId?: string;
  signal?: AbortSignal;
  onProgress?: (progress: CollectProgress) => void;
}): Promise<CollectTargetsResult> {
  const { count, mode, selectedProfiles, filters, searchAccountId, signal, onProgress } =
    options;

  if (mode === "selected") {
    return { targets: selectedProfiles.slice(0, count) };
  }

  const res = await fetch("/api/search/collect-targets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      count,
      accountId: searchAccountId,
      filters: buildSearchBody(filters, 1, searchAccountId),
    }),
    signal,
  });

  if (!res.ok && res.headers.get("Content-Type")?.includes("application/json")) {
    const data = await res.json();
    throw new Error(data.error ?? "Failed to collect targets");
  }

  return readCollectStream(res, onProgress);
}