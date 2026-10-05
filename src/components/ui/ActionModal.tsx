"use client";

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: "hazard" | "danger";
}

export default function ActionModal({
  isOpen,
  onClose,
  title,
  message,
  type = "hazard",
}: ActionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-5 max-w-md w-full shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant pb-2">
          <div className="flex items-center gap-2">
            <span
              className={`material-symbols-outlined ${
                type === "danger" ? "text-error" : "text-primary-container"
              }`}
            >
              {type === "danger" ? "warning" : "local_fire_department"}
            </span>
            <span className="font-mono text-xs uppercase font-bold tracking-wider text-on-surface">
              {title}
            </span>
          </div>
          <button onClick={onClose} className="text-outline hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <p className="text-sm text-on-surface-variant leading-relaxed">{message}</p>

        {/* Dispatch Info */}
        <div className="bg-surface-container-low p-2 rounded text-xs font-mono border border-outline-variant space-y-1">
          <div className="flex justify-between">
            <span>DAOPS TASK FORCE:</span>
            <span className="font-bold text-on-surface">MANGGALA AGNI SECTOR 04</span>
          </div>
          <div className="flex justify-between">
            <span>LINK TRANSMISSION:</span>
            <span className="text-[#6AA84F] font-bold">READY (ENCRYPTED)</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium border border-outline-variant rounded bg-surface-container hover:bg-surface-container-high"
          >
            DISMISS
          </button>
          <button
            onClick={onClose}
            className={`px-4 py-1.5 text-xs font-bold text-white rounded shadow-sm ${
              type === "danger"
                ? "bg-error hover:brightness-110"
                : "bg-tertiary hover:brightness-110"
            }`}
          >
            CONFIRM DISPATCH
          </button>
        </div>
      </div>
    </div>
  );
}
