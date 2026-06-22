import { DocumentCard } from "./DocumentCard";

type Document = {
  id: string;
  name: string;
  status: "READY" | "PROCESSING" | "FAILED";
  uploadedAt: string;
};

type DocumentsGridProps = {
  documents: Document[];
};

export function DocumentsGrid({ documents }: DocumentsGridProps) {
  return (
    <div
      className="
        grid
        grid-cols-1
        md:grid-cols-2
        xl:grid-cols-3
        gap-6
      "
    >
      {documents.map((document) => (
        <DocumentCard key={document.id} {...document} />
      ))}
    </div>
  );
}
