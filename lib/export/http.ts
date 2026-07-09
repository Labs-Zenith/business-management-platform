import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { exportDateStamp } from "@/lib/export/labels";

export type ExportFormat = "xlsx" | "pdf";

export function parseExportFormat(searchParams: URLSearchParams): ExportFormat {
  const format = searchParams.get("format");
  if (format === "xlsx" || format === "pdf") {
    return format;
  }
  throw new ApiError("VALIDATION_ERROR", 'Invalid "format" query parameter.', { format });
}

export function binaryAttachment(body: Buffer, contentType: string, filenamePrefix: string, extension: string): NextResponse {
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filenamePrefix}-${exportDateStamp()}.${extension}"`,
    },
  });
}

export function binaryAttachmentWithFilename(body: Buffer, contentType: string, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
