import { notFound } from "next/navigation";
import { PackScanner } from "@/components/pack-scanner";
import { getBranchSummaries, getPackJob, isPackJobId } from "@/lib/pack";

export default async function PackJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPackJobId(id)) notFound();
  const [job, branches] = await Promise.all([getPackJob(id), getBranchSummaries(id)]);
  if (!job) notFound();
  return <PackScanner jobId={job.id} sourceFile={job.sourceFile} customer={job.customer} initialBranches={branches} />;
}
