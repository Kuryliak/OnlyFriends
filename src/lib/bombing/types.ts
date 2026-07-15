export type JobType = "ADD_FRIENDS" | "SUBSCRIBE";

export interface JobResponse {
  assignments?: Array<{ targets: string[] }>;
  jobs?: unknown[];
  skippedGlobal?: string[];
  batchId?: string;
}

export interface BombingAccount {
  id: string;
  username: string;
  status: string;
}

export interface BombingSearchResult {
  username: string;
  isChannel: boolean;
}