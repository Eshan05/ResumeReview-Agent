import { CandidateDashboard } from "@/components/table/candidates/candidate-dashboard";
import { getDefaultCandidatesList } from "@/lib/candidates/default-job";

export default async function Home() {
  const data = await getDefaultCandidatesList();

  return <CandidateDashboard initialData={data} />;
}
