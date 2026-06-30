const chunkSize: number = Number(Bun.env.UPLOAD_CHUNK_SIZE) * 1024 * 1024;

export function calculateMultipartInfo(fileSize: number) {
  
  const totalParts: number = Math.ceil(fileSize / chunkSize);

  if (totalParts > 10_000) {
    throw new Error("Too many multipart parts.");
  }

  return {
    chunkSize,
    totalParts,
  };
}