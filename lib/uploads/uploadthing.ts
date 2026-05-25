import {
  generateReactHelpers,
  generateUploadButton,
  generateUploadDropzone,
} from "@uploadthing/react";

import type { UploadRouter } from "@/lib/uploads/router";

const uploadsRouteUrl = "/api/uploads";

export const UploadButton = generateUploadButton<UploadRouter>({
  url: uploadsRouteUrl,
});
export const UploadDropzone = generateUploadDropzone<UploadRouter>({
  url: uploadsRouteUrl,
});
export const { uploadFiles, useUploadThing } = generateReactHelpers<UploadRouter>({
  url: uploadsRouteUrl,
});