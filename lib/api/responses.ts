import type { ApiError } from "@/lib/candidates/types";

type ApiErrorCode = ApiError["error"]["code"];

export function json<TData>(data: TData, init?: ResponseInit) {
  return Response.json(data, init);
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  init: ResponseInit,
) {
  return json<ApiError>(
    {
      error: {
        code,
        message,
      },
    },
    init,
  );
}

export function notFound(message = "Resource not found") {
  return apiError("not_found", message, { status: 404 });
}
