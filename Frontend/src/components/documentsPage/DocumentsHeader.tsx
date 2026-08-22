import { UploadButton } from "./UploadButton";

type DocumentsHeaderProps = {
  onUploadClick: () => void;
};

export function DocumentsHeader({ onUploadClick }: DocumentsHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-3xl font-bold">Documents</h1>

        <p className="text-secondary mt-2">
          Manage your uploaded knowledge base.
        </p>
      </div>

      <UploadButton onClick={onUploadClick} />
    </div>
  );
}
