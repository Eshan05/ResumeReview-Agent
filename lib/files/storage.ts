interface UploadThingFilesClient {
  delete: (
    keys: string[],
    options: { concurrency: number },
  ) => Promise<{ deleted: string[] }>;
  download: (key: string) => Promise<{
    arrayBuffer: () => Promise<ArrayBuffer>;
  }>;
}

let uploadFiles: Promise<UploadThingFilesClient> | undefined;

export async function getUploadThingFiles() {
  uploadFiles ??= createUploadThingFiles();
  return uploadFiles;
}

async function createUploadThingFiles(): Promise<UploadThingFilesClient> {
  const [{ Files }, { uploadthing }] = await Promise.all([
    import("files-sdk"),
    import("files-sdk/uploadthing"),
  ]);

  return new Files({
    adapter: uploadthing({
      slug: "resumeUpload",
    }),
  });
}

export async function downloadUploadThingFile({
  key,
  url,
}: {
  key: string;
  url?: string | null;
}) {
  try {
    return await (await getUploadThingFiles()).download(key);
  } catch (error) {
    if (!url) throw error;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download uploaded file: ${response.status}`);
    }

    return new File([await response.arrayBuffer()], key, {
      type: response.headers.get("content-type") ?? "application/octet-stream",
    });
  }
}

export async function deleteUploadThingCustomIds(
  customIds: string[],
  options?: { concurrency?: number },
) {
  if (customIds.length === 0) {
    return {
      deleted: [],
    };
  }

  return (await getUploadThingFiles()).delete(customIds, {
    concurrency: options?.concurrency ?? 8,
  });
}
