import { api } from "../lib/api";

export async function uploadDocument(
  file: File,
) {
    console.log(file,"_-----")
  const response = await api.initializeUpload({
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  });

  return response.data;
}