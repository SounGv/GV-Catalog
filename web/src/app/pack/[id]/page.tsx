import { notFound } from "next/navigation";
import { PackScanner } from "@/components/pack-scanner";
import { getBranchSummaries, getPackJob, isPackJobId } from "@/lib/pack";

export default async function PackJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ embed?: string; kind?: string }>;
}) {
  const [{ id }, { embed, kind }] = await Promise.all([params, searchParams]);
  if (!isPackJobId(id)) notFound();
  const [job, branches] = await Promise.all([getPackJob(id), getBranchSummaries(id)]);
  if (!job) notFound();
  return <PackScanner jobId={job.id} sourceFile={job.sourceFile} customer={job.customer} initialBranches={branches} embedded={embed === "1"} initialKind={kind ?? ""} />;
}
