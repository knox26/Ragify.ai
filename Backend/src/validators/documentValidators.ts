import { z } from "zod";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export const documentInitSchema = z.object({
  fileName: z.string().min(1).max(255),

  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_FILE_SIZE, "Maximum file size is 100MB"),

  mimeType: z.enum(ALLOWED_MIME_TYPES),
});