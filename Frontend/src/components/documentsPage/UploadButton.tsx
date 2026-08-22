import { Upload } from "lucide-react";

type UploadButtonProps = {
  onClick: () => void;
};

export function UploadButton({ onClick }: UploadButtonProps) {
  return (
    <button
      onClick={onClick}
      className="
        h-12
        px-5
        btn-primary
      "
    >
      <Upload size={18} />
      Upload Document
    </button>
  );
}
