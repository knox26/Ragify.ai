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
        rounded-xl
        bg-gradient-to-r
        from-cyan-400
        to-blue-600
        text-white
        font-medium
        flex
        items-center
        gap-2
        hover:opacity-90
        transition
      "
    >
      <Upload size={18} />
      Upload Document
    </button>
  );
}
