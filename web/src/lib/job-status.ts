import type { PackJobSummary } from "@/lib/pack";

/** Where a pack job is in the pick → pack flow, for the mobile menu badges and the PO list tabs. */
export type JobStage = "new" | "picking" | "packing" | "done";

export const STAGE_LABEL: Record<JobStage, string> = {
  new: "ยังไม่เริ่ม",
  picking: "กำลังหยิบ",
  packing: "รอยิงลงลัง",
  done: "เสร็จแล้ว",
};

/**
 * done    = every branch closed
 * packing = picking finished (picked ≥ required) or carton scanning already started
 * picking = some pieces picked
 * new     = nothing picked or scanned yet
 */
export function jobStage(job: PackJobSummary, picked: number): JobStage {
  if (job.branchCount > 0 && job.closedCount >= job.branchCount) return "done";
  if (job.scanned > 0 || (job.required > 0 && picked >= job.required)) return "packing";
  if (picked > 0) return "picking";
  return "new";
}
