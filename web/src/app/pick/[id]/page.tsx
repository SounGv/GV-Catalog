import { notFound } from "next/navigation";
import { PickScanner } from "@/components/pick-scanner";
import { isPackJobId } from "@/lib/pack";
import { getPickDetail } from "@/lib/pick";

export const dynamic = "force-dynamic";

export default async function PickJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPackJobId(id)) notFound();
  const detail = await getPickDetail(id);
  if (!detail) notFound();
  return <PickScanner initial={detail} />;
}
