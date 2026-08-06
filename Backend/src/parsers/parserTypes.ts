export interface DocumentMetadata {
  documentId: string;
  fileName: string;
  userId: string;
}

export interface ParseDocumentParams {
  buffer: Buffer;
  mimeType: string;
  metadata: DocumentMetadata;
}

export interface ParsedPage {
  pageNumber: number;
  text: string;
}
