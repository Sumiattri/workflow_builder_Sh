"use client";
import { X } from "lucide-react";

interface Shortcut {
  label: string;
  keys: string[];
}

const GENERAL: Shortcut[] = [
  { label: "Undo", keys: ["⌘", "Z"] },
  { label: "Redo", keys: ["⌘", "Shift", "Z"] },
  { label: "Select all", keys: ["⌘", "A"] },
  { label: "Deselect all", keys: ["Esc"] },
  { label: "Pan canvas", keys: ["Space", "Drag"] },
  { label: "Zoom in", keys: ["+"] },
  { label: "Zoom out", keys: ["−"] },
  { label: "Fit view", keys: ["F"] },
  { label: "Toggle select mode", keys: ["S"] },
  { label: "Auto-arrange", keys: ["Shift", "A"] },
];

const NODE_OPS: Shortcut[] = [
  { label: "Copy", keys: ["⌘", "C"] },
  { label: "Paste", keys: ["⌘", "V"] },
  { label: "Duplicate", keys: ["⌘", "D"] },
  { label: "Duplicate with Edges", keys: ["⌘", "Shift", "D"] },
  { label: "Delete", keys: ["Delete"] },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[28px] items-center justify-center rounded-lg border border-node-border bg-slate-50 px-2 py-1 font-mono text-[12px] font-medium text-slate-600 shadow-sm">
      {children}
    </kbd>
  );
}

function Row({ s }: { s: Shortcut }) {
  return (
    <div className="flex items-center justify-between border-b border-node-border/70 py-2.5 last:border-b-0">
      <span className="text-[14px] text-slate-700">{s.label}</span>
      <div className="flex items-center gap-1.5">
        {s.keys.map((k, i) => (
          <Kbd key={i}>{k}</Kbd>
        ))}
      </div>
    </div>
  );
}

export function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Keyboard Shortcuts
            </h2>
            <p className="mt-1 text-[14px] text-slate-500">
              Quickly navigate and create with these shortcuts.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h3 className="mb-1 mt-4 text-[15px] font-bold text-slate-900">
          General
        </h3>
        {GENERAL.map((s) => (
          <Row key={s.label} s={s} />
        ))}

        <h3 className="mb-1 mt-6 text-[15px] font-bold text-slate-900">
          Node Operations
        </h3>
        {NODE_OPS.map((s) => (
          <Row key={s.label} s={s} />
        ))}
      </div>
    </div>
  );
}
