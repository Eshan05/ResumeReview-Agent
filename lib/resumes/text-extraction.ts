import mammoth from "mammoth";

type ResumeExtractionMethod =
  | "ai-ocr"
  | "cached"
  | "mammoth"
  | "pdfjs"
  | "plain-text"
  | "tesseract";

type OcrProvider = "google" | "openai";

type GenerateTextForOcr = (options: {
  maxOutputTokens: number;
  maxRetries: number;
  messages: Array<{
    content: unknown;
    role: "user";
  }>;
  model: unknown;
  temperature: number;
  timeout: number;
}) => Promise<{ text: string }>;

export interface ResumeTextExtraction {
  applicantEmail?: string;
  applicantName?: string;
  characterCount: number;
  extractionMethod: ResumeExtractionMethod;
  rawText: string;
}

interface ResumeOcrResult {
  method: Extract<ResumeExtractionMethod, "ai-ocr" | "tesseract">;
  rawText: string;
}

const DEFAULT_PDF_TEXT_CONCURRENCY = 4;
const DEFAULT_PDF_OCR_CONCURRENCY = 1;
const DEFAULT_PDF_OCR_SCALE = 3;
const DEFAULT_IMAGE_OCR_SCALE = 2;
const DEFAULT_SCANNED_PDF_MIN_TEXT_CHARS = 80;
const DEFAULT_OCR_MAX_OUTPUT_TOKENS = 6000;
const DEFAULT_OCR_TIMEOUT_MS = 60_000;
const DEFAULT_OCR_MAX_RETRIES = 2;

export async function extractResumeText({
  fileName,
  fileType,
  data,
}: {
  data: ArrayBuffer;
  fileName: string;
  fileType: string;
}): Promise<ResumeTextExtraction> {
  const lowerFileName = fileName.toLowerCase();
  const normalizedType = fileType.toLowerCase();

  if (isPdfResume(normalizedType, lowerFileName)) {
    const text = await extractPdfText(data);

    if (hasUsablePdfText(text)) {
      return toExtraction(text, "pdfjs");
    }

    const ocr = await extractWithOcr({
      data,
      fileName,
      mediaType: inferMediaType(fileName, fileType),
      sourceKind: "pdf",
    });

    return toExtraction(ocr.rawText, ocr.method);
  }

  if (
    normalizedType.includes("wordprocessingml") ||
    lowerFileName.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    return toExtraction(result.value, "mammoth");
  }

  if (normalizedType.includes("msword") || lowerFileName.endsWith(".doc")) {
    return toExtraction(extractLegacyDocText(data), "plain-text");
  }

  if (
    normalizedType.startsWith("text/") ||
    lowerFileName.endsWith(".txt") ||
    lowerFileName.endsWith(".md")
  ) {
    return toExtraction(new TextDecoder().decode(data), "plain-text");
  }

  if (isImageResume(normalizedType, lowerFileName)) {
    const ocr = await extractWithOcr({
      data,
      fileName,
      mediaType: inferMediaType(fileName, fileType),
      sourceKind: "image",
    });

    return toExtraction(ocr.rawText, ocr.method);
  }

  throw new Error(`Unsupported resume file type: ${fileType || fileName}`);
}

async function extractPdfText(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await registerPdfWorker();
  const document = await pdfjs.getDocument({
    data: copyArrayBufferForPdfjs(data),
    disableFontFace: true,
    useWorkerFetch: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  }).promise;
  const pageNumbers = Array.from(
    { length: document.numPages },
    (_, index) => index + 1,
  );

  const pages = await mapWithConcurrency(
    pageNumbers,
    getPositiveIntegerEnv(
      "RESUME_PDF_TEXT_CONCURRENCY",
      DEFAULT_PDF_TEXT_CONCURRENCY,
    ),
    async (pageNumber) => {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      return extractTextItemsWithLayout(content.items);
    },
  );

  await document.destroy?.();

  return pages.join("\n\n");
}

async function extractWithOcr({
  data,
  fileName,
  mediaType,
  sourceKind,
}: {
  data: ArrayBuffer;
  fileName: string;
  mediaType: string;
  sourceKind: "image" | "pdf";
}): Promise<ResumeOcrResult> {
  const provider = getConfiguredOcrProvider();

  if (provider && process.env.RESUME_OCR_MODE === "provider") {
    return {
      method: "ai-ocr",
      rawText: await extractWithAiOcr({
        data,
        fileName,
        mediaType,
        provider,
        sourceKind,
      }),
    };
  }

  try {
    return {
      method: "tesseract",
      rawText:
        sourceKind === "pdf"
          ? await extractPdfTextWithTesseract(data)
          : await extractImageTextWithTesseract(data),
    };
  } catch (localError) {
    if (provider) {
      return {
        method: "ai-ocr",
        rawText: await extractWithAiOcr({
          data,
          fileName,
          mediaType,
          provider,
          sourceKind,
        }),
      };
    }

    throw localError;
  }
}

async function extractWithAiOcr({
  data,
  fileName,
  mediaType,
  provider,
  sourceKind,
}: {
  data: ArrayBuffer;
  fileName: string;
  mediaType: string;
  provider: OcrProvider;
  sourceKind: "image" | "pdf";
}) {
  const { generateText } = await import("ai");
  const generateTextForOcr = generateText as unknown as GenerateTextForOcr;
  const model = await getAiOcrModel(provider);
  const fileBuffer = Buffer.from(data);
  const attachment =
    sourceKind === "image"
      ? {
          image: fileBuffer,
          mediaType,
          type: "image" as const,
        }
      : {
          data: fileBuffer,
          filename: fileName,
          mediaType,
          type: "file" as const,
        };
  const content = [
    {
      text: [
        "Extract all readable resume text from the attached file.",
        "Return plain text only.",
        "Preserve contact details, headings, dates, titles, companies, schools, skills, and bullet content.",
        "Do not summarize. Do not add commentary.",
        "If no readable text exists, return an empty string.",
      ].join(" "),
      type: "text",
    },
    attachment,
  ];
  const result = await generateTextForOcr({
    maxOutputTokens: getPositiveIntegerEnv(
      "RESUME_OCR_MAX_OUTPUT_TOKENS",
      DEFAULT_OCR_MAX_OUTPUT_TOKENS,
    ),
    maxRetries: getPositiveIntegerEnv(
      "RESUME_OCR_MAX_RETRIES",
      DEFAULT_OCR_MAX_RETRIES,
    ),
    messages: [
      {
        content,
        role: "user",
      },
    ],
    model,
    temperature: 0,
    timeout: getPositiveIntegerEnv(
      "RESUME_OCR_TIMEOUT_MS",
      DEFAULT_OCR_TIMEOUT_MS,
    ),
  });
  const text = result.text.trim();

  if (text.length < 2) {
    throw new Error("OCR returned no readable resume text.");
  }

  return text;
}

async function getAiOcrModel(provider: OcrProvider) {
  const configuredModel = process.env.RESUME_OCR_MODEL?.trim();

  if (provider === "google") {
    const apiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "RESUME_OCR_PROVIDER=google requires GOOGLE_GENERATIVE_AI_API_KEY.",
      );
    }

    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const google = createGoogleGenerativeAI({ apiKey });
    return google(configuredModel || "gemini-2.5-flash");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("RESUME_OCR_PROVIDER=openai requires OPENAI_API_KEY.");
  }

  const { createOpenAI } = await import("@ai-sdk/openai");
  const openai = createOpenAI({ apiKey });
  return openai(configuredModel || "gpt-4.1-mini");
}

async function extractImageTextWithTesseract(data: ArrayBuffer) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(
    process.env.RESUME_LOCAL_OCR_LANGS?.trim() || "eng",
  );

  try {
    await configureTesseractWorker(worker);
    const result = await worker.recognize(
      await prepareImageForOcr(Buffer.from(data)),
    );
    const text = result.data.text.trim();

    if (text.length < 2) {
      throw new Error("Local OCR returned no readable resume text.");
    }

    return text;
  } finally {
    await worker.terminate();
  }
}

async function extractPdfTextWithTesseract(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await registerPdfWorker();
  const document = await pdfjs.getDocument({
    data: copyArrayBufferForPdfjs(data),
    disableFontFace: true,
    useWorkerFetch: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  }).promise;
  const pageNumbers = Array.from(
    { length: document.numPages },
    (_, index) => index + 1,
  );
  const concurrency = getPositiveIntegerEnv(
    "RESUME_PDF_OCR_CONCURRENCY",
    DEFAULT_PDF_OCR_CONCURRENCY,
  );
  const scheduler = await createTesseractScheduler(concurrency);

  try {
    const pageTexts = await mapWithConcurrency(
      pageNumbers,
      concurrency,
      async (pageNumber) => {
        const image = await renderPdfPageToPng({
          document,
          pageNumber,
          scale: getPositiveNumberEnv(
            "RESUME_PDF_OCR_SCALE",
            DEFAULT_PDF_OCR_SCALE,
          ),
        });
        const result = await scheduler.addJob("recognize", image);
        return result.data.text.trim();
      },
    );
    const text = pageTexts.join("\n\n").trim();

    if (text.length < 2) {
      throw new Error("Local PDF OCR returned no readable resume text.");
    }

    return text;
  } finally {
    await scheduler.terminate();
    await document.destroy?.();
  }
}

async function createTesseractScheduler(concurrency: number) {
  const { createScheduler, createWorker } = await import("tesseract.js");
  const scheduler = createScheduler();
  const languages = process.env.RESUME_LOCAL_OCR_LANGS?.trim() || "eng";
  const workerCount = Math.max(1, concurrency);

  for (let index = 0; index < workerCount; index += 1) {
    const worker = await createWorker(languages);
    await configureTesseractWorker(worker);
    scheduler.addWorker(worker);
  }

  return scheduler;
}

async function renderPdfPageToPng({
  document,
  pageNumber,
  scale,
}: {
  document: {
    getPage: (pageNumber: number) => Promise<unknown>;
  };
  pageNumber: number;
  scale: number;
}) {
  const { createCanvas } = await import("@napi-rs/canvas");
  const page = (await document.getPage(pageNumber)) as {
    getViewport: (options: { scale: number }) => {
      height: number;
      width: number;
    };
    render: (options: { canvasContext: unknown; viewport: unknown }) => {
      promise: Promise<void>;
    };
  };
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
  const canvasContext = canvas.getContext("2d");
  canvasContext.fillStyle = "#fff";
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext,
    viewport,
  }).promise;

  return canvas.toBuffer("image/png");
}

async function configureTesseractWorker(worker: {
  setParameters: (params: Record<string, string>) => Promise<unknown>;
}) {
  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: "3",
    user_defined_dpi: "300",
  });
}

async function prepareImageForOcr(image: Buffer) {
  try {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const source = await loadImage(image);
    const scale = getPositiveNumberEnv(
      "RESUME_IMAGE_OCR_SCALE",
      DEFAULT_IMAGE_OCR_SCALE,
    );
    const canvas = createCanvas(
      Math.ceil(source.width * scale),
      Math.ceil(source.height * scale),
    );
    const context = canvas.getContext("2d");

    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] / 255;
      const red = data[index] * alpha + 255 * (1 - alpha);
      const green = data[index + 1] * alpha + 255 * (1 - alpha);
      const blue = data[index + 2] * alpha + 255 * (1 - alpha);
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      const contrasted = Math.max(
        0,
        Math.min(255, (luminance - 128) * 1.25 + 128),
      );

      data[index] = contrasted;
      data[index + 1] = contrasted;
      data[index + 2] = contrasted;
      data[index + 3] = 255;
    }

    context.putImageData(imageData, 0, 0);

    return canvas.toBuffer("image/png");
  } catch {
    return image;
  }
}

async function registerPdfWorker() {
  const workerGlobal = globalThis as typeof globalThis & {
    pdfjsWorker?: unknown;
  };

  workerGlobal.pdfjsWorker ??= await import(
    "pdfjs-dist/legacy/build/pdf.worker.mjs"
  );
}

function extractLegacyDocText(data: ArrayBuffer) {
  const text = new TextDecoder().decode(data);
  const normalized = Array.from(text)
    .map((char) => (isReadableTextChar(char) ? char : " "))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length < 2) {
    throw new Error("Legacy DOC text extraction returned no readable text");
  }

  return normalized;
}

function isReadableTextChar(char: string) {
  const code = char.charCodeAt(0);
  return code === 9 || code === 10 || code === 13 || code >= 32;
}

function isPdfResume(normalizedType: string, lowerFileName: string) {
  return normalizedType.includes("pdf") || lowerFileName.endsWith(".pdf");
}

function isImageResume(normalizedType: string, lowerFileName: string) {
  return (
    normalizedType.startsWith("image/") ||
    lowerFileName.endsWith(".png") ||
    lowerFileName.endsWith(".jpg") ||
    lowerFileName.endsWith(".jpeg") ||
    lowerFileName.endsWith(".webp")
  );
}

function hasUsablePdfText(text: string) {
  return (
    text.replace(/\s+/g, " ").trim().length >=
    getPositiveIntegerEnv(
      "RESUME_SCANNED_PDF_MIN_TEXT_CHARS",
      DEFAULT_SCANNED_PDF_MIN_TEXT_CHARS,
    )
  );
}

function inferMediaType(fileName: string, fileType: string) {
  if (fileType) return fileType.toLowerCase();

  const extension = fileName.split(".").pop()?.toLowerCase();
  const mediaTypes: Record<string, string> = {
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    pdf: "application/pdf",
    png: "image/png",
    webp: "image/webp",
  };

  return mediaTypes[extension ?? ""] ?? "application/octet-stream";
}

function copyArrayBufferForPdfjs(data: ArrayBuffer) {
  return new Uint8Array(data).slice();
}

function getConfiguredOcrProvider(): OcrProvider | undefined {
  const provider = process.env.RESUME_OCR_PROVIDER?.trim().toLowerCase();

  if (!provider) return undefined;
  if (provider === "google" || provider === "openai") return provider;

  throw new Error(
    "RESUME_OCR_PROVIDER must be either google or openai when set.",
  );
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function getPositiveNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function mapWithConcurrency<TValue, TResult>(
  values: TValue[],
  concurrency: number,
  mapper: (value: TValue, index: number) => Promise<TResult>,
) {
  if (values.length === 0) return [];

  const results = new Array<TResult>(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), values.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

function toExtraction(
  rawText: string,
  extractionMethod: ResumeTextExtraction["extractionMethod"],
): ResumeTextExtraction {
  const text = sanitizeExtractedText(rawText)
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    applicantEmail: extractEmail(text),
    applicantName: extractName(text),
    characterCount: text.length,
    extractionMethod,
    rawText: text,
  };
}

function extractTextItemsWithLayout(items: unknown[]) {
  const textItems = items
    .map((item) => toPdfTextItem(item))
    .filter((item): item is PdfTextItem => Boolean(item?.text));
  const lines: PdfTextItem[][] = [];

  for (const item of textItems.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((candidate) =>
      candidate.some((lineItem) => Math.abs(lineItem.y - item.y) <= 3),
    );

    if (line) {
      line.push(item);
    } else {
      lines.push([item]);
    }
  }

  return lines
    .map((line) =>
      line
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

interface PdfTextItem {
  text: string;
  x: number;
  y: number;
}

function toPdfTextItem(item: unknown): PdfTextItem | undefined {
  if (!item || typeof item !== "object" || !("str" in item)) return undefined;

  const record = item as { str?: unknown; transform?: unknown };
  const text =
    typeof record.str === "string" ? sanitizeExtractedText(record.str) : "";
  const transform = Array.isArray(record.transform) ? record.transform : [];
  const x = Number(transform[4]);
  const y = Number(transform[5]);

  return {
    text: text.trim(),
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

function sanitizeExtractedText(text: string) {
  return stripControlCharacters(text)
    .replace(/[\u00d3\u00af\u0087]/g, " ")
    .replace(/\sR\s+(?=[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, " ")
    .replace(/[ \t]{2,}/g, " ");
}

function stripControlCharacters(text: string) {
  return Array.from(text, (char) => {
    const code = char.charCodeAt(0);
    if (
      (code >= 0x00 && code <= 0x08) ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      (code >= 0x7f && code <= 0x9f)
    ) {
      return " ";
    }

    return char;
  }).join("");
}

function extractEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function extractName(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length >= 2 && line.length <= 80);
}
