import { apiError, json } from "@/lib/api/responses";
import { getResumeWorkflowStatuses } from "@/lib/resumes/service";

export const dynamic = "force-dynamic";

const MAX_STATUS_IDS = 25;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const resumeIds = parseResumeIds(url.searchParams.get("ids"));

  if (resumeIds.length === 0) {
    return apiError("bad_request", "At least one resume id is required", {
      status: 400,
    });
  }

  if (resumeIds.length > MAX_STATUS_IDS) {
    return apiError(
      "bad_request",
      `At most ${MAX_STATUS_IDS} resume ids can be checked at once`,
      { status: 400 },
    );
  }

  const statuses = await getResumeWorkflowStatuses(resumeIds);

  return json({ statuses });
}

function parseResumeIds(value: string | null) {
  if (!value) return [];

  return Array.from(
    new Set(
      value
        .split(",")
        .map((resumeId) => resumeId.trim())
        .filter(Boolean),
    ),
  );
}
