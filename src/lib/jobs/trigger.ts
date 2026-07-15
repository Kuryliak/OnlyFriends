import { runWorkerCycle } from "@/lib/jobs/scheduler";

export function kickJobProcessor(jobId?: string): void {
  void runWorkerCycle(jobId);
}