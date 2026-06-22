import { useMemo, useState } from "react";

import { DocumentsHeader } from "../components/documentsPage/DocumentsHeader";
import { DocumentsSearch } from "../components/documentsPage/DocumentsSearch";
import { DocumentsGrid } from "../components/documentsPage/DocumentsGrid";

const mockDocuments = [
  {
    id: "1",
    name: "React Handbook.pdf",
    status: "READY" as const,
    uploadedAt: "2 days ago",
  },
  {
    id: "2",
    name: "AWS Architecture Guide.pdf",
    status: "PROCESSING" as const,
    uploadedAt: "15 minutes ago",
  },
  {
    id: "3",
    name: "Research Paper.pdf",
    status: "FAILED" as const,
    uploadedAt: "1 hour ago",
  },
  {
    id: "4",
    name: "Prisma Guide.pdf",
    status: "READY" as const,
    uploadedAt: "4 days ago",
  },
];

export default function DocumentsPage() {
  const [search, setSearch] = useState("");

  const filteredDocuments = useMemo(() => {
    return mockDocuments.filter((document) =>
      document.name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [search]);

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <DocumentsHeader />

        <DocumentsSearch value={search} onChange={setSearch} />

        <DocumentsGrid documents={filteredDocuments} />
      </div>
    </div>
  );
}
