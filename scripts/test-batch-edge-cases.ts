const baseUrl = process.env.BATCH_EDGE_BASE_URL ?? "http://localhost:3001";
const jobId = process.env.BATCH_EDGE_JOB_ID ?? "local-resume-review-job";
const createdBatchIds: string[] = [];

type EdgeResult = [string, number | string];

function assert(
  condition: unknown,
  message: string,
  details?: unknown,
): asserts condition {
  if (!condition) {
    const error = new Error(message) as Error & { details?: unknown };
    error.details = details;
    throw error;
  }
}

function createBatchId(label: string) {
  const id = `edge-${label}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
  createdBatchIds.push(id);
  return id;
}

function makeFiles(
  batchId: string,
  count: number,
  options: {
    largeLastModified?: number;
    rejectedEvery?: number;
  } = {},
) {
  return Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    const rejected =
      options.rejectedEvery !== undefined &&
      (index + 1) % options.rejectedEvery === 0;

    return {
      id: `${batchId}-item-${number}`,
      lastModified: options.largeLastModified ?? Date.now(),
      name: `resume-${number}.txt`,
      preflightIssue: rejected ? "Edge rejected file" : undefined,
      preflightStatus: rejected ? "rejected" : "accepted",
      size: 128 + index,
      type: "text/plain",
    };
  });
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let json: unknown = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { json, response, text };
}

async function createBatch(id: string, files: ReturnType<typeof makeFiles>) {
  return request("/api/resume-batches", {
    body: JSON.stringify({ files, id, jobId }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

async function cancelBatch(id: string) {
  return request(`/api/resume-batches/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
}

async function getBatch(id: string) {
  return request(`/api/resume-batches/${encodeURIComponent(id)}`);
}

async function readSseSnapshot(id: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const response = await fetch(
    `${baseUrl}/api/resume-batches/${encodeURIComponent(id)}/progress/stream`,
    { signal: controller.signal },
  );

  assert(response.ok, "SSE stream should open", { status: response.status });
  assert(response.body, "SSE stream should expose a response body");

  const body = response.body;
  const reader = body.getReader();
  let buffer = "";

  try {
    while (!buffer.includes("\n\n")) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += Buffer.from(value).toString("utf8");
    }
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }

  return buffer;
}

function getBatchPayload(value: unknown) {
  assert(
    value && typeof value === "object" && "batch" in value && "items" in value,
    "Batch response shape is invalid",
    value,
  );

  return value as {
    batch: {
      acceptedCount: number;
      cancelledCount: number;
      rejectedCount: number;
      status: string;
      totalCount: number;
    };
    items: Array<{ lastModified: number }>;
  };
}

function getDispatchPayload(value: unknown) {
  assert(
    value && typeof value === "object" && "status" in value,
    "Dispatch response shape is invalid",
    value,
  );

  return value as { status: string };
}

function getRecoveryPayload(value: unknown) {
  assert(
    value && typeof value === "object" && "recovered" in value,
    "Recovery response shape is invalid",
    value,
  );

  return value as { recovered: number };
}

async function run() {
  const results: EdgeResult[] = [];

  const malformedCreate = await request("/api/resume-batches", {
    body: "{bad-json",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert(
    malformedCreate.response.status === 400,
    "Malformed create JSON should return 400",
    malformedCreate.text,
  );
  results.push(["malformed create JSON", malformedCreate.response.status]);

  const emptyCreate = await createBatch(createBatchId("empty"), []);
  assert(
    emptyCreate.response.status === 400,
    "Empty create should return 400",
    emptyCreate.text,
  );
  results.push(["empty create payload", emptyCreate.response.status]);

  const tooManyId = createBatchId("too-many");
  const tooManyCreate = await createBatch(tooManyId, makeFiles(tooManyId, 101));
  assert(
    tooManyCreate.response.status === 400,
    "101 files should return 400",
    tooManyCreate.text,
  );
  results.push(["101-file create payload", tooManyCreate.response.status]);

  const mixedId = createBatchId("mixed");
  const largeLastModified = Number.MAX_SAFE_INTEGER;
  const mixedFiles = makeFiles(mixedId, 100, {
    largeLastModified,
    rejectedEvery: 10,
  });
  const mixedCreate = await createBatch(mixedId, mixedFiles);
  assert(mixedCreate.response.ok, "Mixed 100-file create should pass", {
    status: mixedCreate.response.status,
    text: mixedCreate.text,
  });

  const mixedGet = await getBatch(mixedId);
  const mixedPayload = getBatchPayload(mixedGet.json);
  assert(
    mixedPayload.batch.totalCount === 100,
    "Mixed total count should be 100",
    mixedPayload.batch,
  );
  assert(
    mixedPayload.batch.acceptedCount === 90,
    "Mixed accepted count should be 90",
    mixedPayload.batch,
  );
  assert(
    mixedPayload.batch.rejectedCount === 10,
    "Mixed rejected count should be 10",
    mixedPayload.batch,
  );
  assert(
    mixedPayload.items[0]?.lastModified === largeLastModified,
    "lastModified bigint should roundtrip",
    mixedPayload.items[0],
  );
  results.push([
    "mixed 100-file create + bigint lastModified",
    mixedPayload.batch.status,
  ]);

  const duplicateCreate = await createBatch(mixedId, mixedFiles);
  assert(duplicateCreate.response.ok, "Duplicate exact create should pass", {
    status: duplicateCreate.response.status,
    text: duplicateCreate.text,
  });
  const duplicatePayload = getBatchPayload((await getBatch(mixedId)).json);
  assert(
    duplicatePayload.items.length === 100,
    "Duplicate exact create should not duplicate items",
    duplicatePayload.items.length,
  );
  results.push(["duplicate exact create idempotency", 100]);

  const scopedA = createBatchId("scope-a");
  const scopedB = createBatchId("scope-b");
  assert(
    (await createBatch(scopedA, makeFiles(scopedA, 3))).response.ok,
    "Scoped A create should pass",
  );
  assert(
    (await createBatch(scopedB, makeFiles(scopedB, 3))).response.ok,
    "Scoped B create should pass",
  );
  assert(
    (await cancelBatch(scopedA)).response.ok,
    "Scoped A cancel should pass",
  );

  const scopedAState = getBatchPayload((await getBatch(scopedA)).json);
  const scopedBState = getBatchPayload((await getBatch(scopedB)).json);
  assert(
    scopedAState.batch.cancelledCount === 3,
    "Scoped A should have 3 cancelled items",
    scopedAState.batch,
  );
  assert(
    scopedBState.batch.cancelledCount === 0,
    "Scoped B should not be cancelled by scoped A cancel",
    scopedBState.batch,
  );
  assert(
    scopedBState.batch.status === "created",
    "Scoped B should remain created",
    scopedBState.batch,
  );
  results.push(["cancel scoping across batches", "3/0"]);

  const malformedDispatch = await request(
    `/api/resume-batches/${encodeURIComponent(scopedB)}/dispatch`,
    {
      body: "{bad-json",
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  assert(
    malformedDispatch.response.status === 400,
    "Malformed dispatch JSON should return 400",
    malformedDispatch.text,
  );
  results.push(["malformed dispatch JSON", malformedDispatch.response.status]);

  const overLimitDispatch = await request(
    `/api/resume-batches/${encodeURIComponent(scopedB)}/dispatch`,
    {
      body: JSON.stringify({ limit: 26 }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  assert(
    overLimitDispatch.response.status === 400,
    "Dispatch limit >25 should return 400",
    overLimitDispatch.text,
  );
  results.push([
    "dispatch limit validation",
    overLimitDispatch.response.status,
  ]);

  const dispatchCanceled = await request(
    `/api/resume-batches/${encodeURIComponent(scopedA)}/dispatch`,
    { method: "POST" },
  );
  assert(
    dispatchCanceled.response.ok,
    "Dispatch canceled batch should respond OK",
    dispatchCanceled.text,
  );
  const dispatchPayload = getDispatchPayload(dispatchCanceled.json);
  assert(
    dispatchPayload.status === "cancelled",
    "Dispatch canceled batch should not claim work",
    dispatchPayload,
  );
  results.push(["dispatch canceled batch", dispatchPayload.status]);

  const recoverCanceled = await request("/api/resume-batches/recover", {
    body: JSON.stringify({ batchId: scopedA }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert(
    recoverCanceled.response.ok,
    "Recover canceled batch should pass",
    recoverCanceled.text,
  );
  const recoverPayload = getRecoveryPayload(recoverCanceled.json);
  assert(
    recoverPayload.recovered === 0,
    "Recover canceled should not requeue items",
    recoverPayload,
  );
  results.push(["recover canceled batch", recoverPayload.recovered]);

  const unknownGet = await request("/api/resume-batches/not-a-real-batch");
  assert(
    unknownGet.response.status === 404,
    "Unknown batch should return 404",
    unknownGet.text,
  );
  results.push(["unknown batch GET", unknownGet.response.status]);

  const streamText = await readSseSnapshot(scopedA);
  assert(
    streamText.includes("event: snapshot"),
    "Progress stream should emit snapshot",
    streamText,
  );
  assert(
    streamText.includes(scopedA),
    "Progress stream snapshot should include batch id",
    streamText,
  );
  results.push(["progress stream snapshot", "ok"]);

  await cancelBatch(mixedId);
  await cancelBatch(scopedB);

  return results;
}

run()
  .then((results) => {
    console.log(JSON.stringify({ passed: results.length, results }, null, 2));
  })
  .catch(async (error: Error & { details?: unknown }) => {
    console.error(error.message);
    if (error.details) console.error(JSON.stringify(error.details, null, 2));
    for (const id of createdBatchIds) {
      try {
        await cancelBatch(id);
      } catch {
        // Best-effort cleanup only.
      }
    }
    process.exit(1);
  });
