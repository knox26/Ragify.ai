import { useMemo, useState, useEffect } from "react";

import { DocumentsHeader } from "../components/documentsPage/DocumentsHeader";
import { DocumentsSearch } from "../components/documentsPage/DocumentsSearch";
import { DocumentsGrid } from "../components/documentsPage/DocumentsGrid";
import { api, type Document } from "../lib/api";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchDocuments = async () => {
    try {
      setIsLoading(true);

      const response = await api.getDocuments();

      setDocuments(response.data ?? []);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const filteredDocuments = useMemo(() => {
    return documents.filter((document) =>
      document.fileName.toLowerCase().includes(search.toLowerCase()),
    );
  }, [documents, search]);

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto">Loading documents...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <DocumentsHeader onUploadSuccess={fetchDocuments} />

        <DocumentsSearch value={search} onChange={setSearch} />

        <DocumentsGrid documents={filteredDocuments} />
      </div>
    </div>
  );
}
