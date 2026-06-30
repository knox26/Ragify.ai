export function generateR2Key(userId: string, documentId: string): string {
  return `documents/${userId}/${documentId}`;
}