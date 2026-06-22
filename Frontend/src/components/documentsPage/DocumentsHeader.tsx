import { UploadButton } from "./UploadButton";
import { UploadModal } from "./UploadModal";
import { useState } from "react";

export function DocumentsHeader() {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Documents</h1>

          <p className="text-secondary mt-2">
            Manage your uploaded knowledge base.
          </p>
        </div>

        <UploadButton onClick={() => setIsUploadOpen(true)} />
      </div>
      <UploadModal open={isUploadOpen} onClose={() => setIsUploadOpen(false)} />
    </>
  );
}
