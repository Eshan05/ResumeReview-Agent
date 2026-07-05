import { describe, expect, it } from "vitest";
import { extractResumeText } from "./text-extraction";

const runOcrTests = process.env.RUN_OCR_TESTS === "true";

describe.runIf(runOcrTests)("resume OCR regression fixtures", () => {
  it("extracts text from a generated scanned resume PDF", async () => {
    const previousProvider = process.env.RESUME_OCR_PROVIDER;
    const previousMode = process.env.RESUME_OCR_MODE;
    const previousScale = process.env.RESUME_PDF_OCR_SCALE;
    delete process.env.RESUME_OCR_PROVIDER;
    delete process.env.RESUME_OCR_MODE;
    process.env.RESUME_PDF_OCR_SCALE = "2";

    try {
      const pdf = await createScannedResumePdf();
      const extraction = await extractResumeText({
        data: toArrayBuffer(pdf),
        fileName: "scanned-resume-fixture.pdf",
        fileType: "application/pdf",
      });
      const text = extraction.rawText.toLowerCase();

      expect(extraction.extractionMethod).toBe("tesseract");
      expect(text).toContain("resume");
      expect(text).toContain("react");
      expect(text).toContain("node");
      expect(text).toContain("sql");
    } finally {
      restoreEnv("RESUME_OCR_PROVIDER", previousProvider);
      restoreEnv("RESUME_OCR_MODE", previousMode);
      restoreEnv("RESUME_PDF_OCR_SCALE", previousScale);
    }
  }, 180_000);
});

async function createScannedResumePdf() {
  const { createCanvas } = await import("@napi-rs/canvas");
  const width = 1200;
  const height = 1600;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#111111";
  context.font = "bold 72px Arial";
  context.fillText("OCR Resume Fixture", 90, 160);
  context.font = "52px Arial";
  context.fillText("Candidate: Test Applicant", 90, 270);
  context.fillText("Skills: React, Node, SQL", 90, 360);
  context.fillText("Project: Full stack dashboard", 90, 450);
  context.fillText("Evidence: API work and data modeling", 90, 540);

  const jpeg = canvas.toBuffer("image/jpeg");
  return createPdfWithJpegImage({ height, jpeg, width });
}

function createPdfWithJpegImage({
  height,
  jpeg,
  width,
}: {
  height: number;
  jpeg: Buffer;
  width: number;
}) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    {
      dictionary: `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
      stream: jpeg,
    },
    {
      dictionary: `<< /Length ${Buffer.byteLength(
        `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`,
        "latin1",
      )} >>`,
      stream: Buffer.from(
        `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`,
        "latin1",
      ),
    },
  ];
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.concat(chunks).length;
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`, "latin1"));

    if (typeof object === "string") {
      chunks.push(Buffer.from(`${object}\nendobj\n`, "latin1"));
      return;
    }

    chunks.push(Buffer.from(`${object.dictionary}\nstream\n`, "latin1"));
    chunks.push(object.stream);
    chunks.push(Buffer.from("\nendstream\nendobj\n", "latin1"));
  });

  const xrefOffset = Buffer.concat(chunks).length;
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets
      .slice(1)
      .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    xrefOffset.toString(),
    "%%EOF",
  ].join("\n");

  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
