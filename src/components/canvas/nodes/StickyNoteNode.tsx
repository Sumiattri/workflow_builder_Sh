"use client";
import { type NodeProps } from "@xyflow/react";
import { Bold } from "lucide-react";
import { useWorkflowStore, type AppNode } from "@/lib/store";
import { type StickyNoteData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCanvasActions } from "../CanvasContext";

const NOTE_COLORS: Record<string, { bg: string; border: string; swatch: string }> = {
  yellow: { bg: "#fef9c3", border: "#fde047", swatch: "#fde047" },
  blue: { bg: "#dbeafe", border: "#93c5fd", swatch: "#93c5fd" },
  green: { bg: "#dcfce7", border: "#86efac", swatch: "#86efac" },
  pink: { bg: "#fce7f3", border: "#f9a8d4", swatch: "#f9a8d4" },
  purple: { bg: "#ede9fe", border: "#c4b5fd", swatch: "#c4b5fd" },
  orange: { bg: "#ffedd5", border: "#fdba74", swatch: "#fdba74" },
};
const COLOR_KEYS = Object.keys(NOTE_COLORS);

const FONTS: Record<string, string> = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
  mono: "ui-monospace, SFMono-Regular, monospace",
  cursive: "'Comic Sans MS', 'Segoe Script', cursive",
};
const FONT_KEYS = Object.keys(FONTS);

const MIN_SIZE = 12;
const MAX_SIZE = 48;

export function StickyNoteNode({ id, data, selected }: NodeProps<AppNode>) {
  const d = data as StickyNoteData;
  const update = useWorkflowStore((s) => s.updateNodeData);
  const runtime = useWorkflowStore((s) => s.runtime[id]);
  const { isRunning, activeScope } = useCanvasActions();
  const locked =
    (isRunning && activeScope !== "SINGLE") ||
    runtime?.status === "PENDING" ||
    runtime?.status === "RUNNING";
  const set = (patch: Partial<StickyNoteData>) => update(id, patch);
  const colors = NOTE_COLORS[d.color] ?? NOTE_COLORS.yellow!;

  return (
    <div className="relative" style={{ width: 240 }}>
      <div
        className={cn(
          "rounded-2xl p-3 shadow-md transition-shadow",
          selected && "ring-2 ring-slate-400"
        )}
        style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
      >
        <textarea
          value={d.text}
          disabled={locked}
          onChange={(e) => set({ text: e.target.value })}
          placeholder="Type a note…"
          className="nodrag block w-full resize-none bg-transparent leading-snug text-slate-700 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            fontFamily: FONTS[d.fontFamily] ?? FONTS.sans,
            fontWeight: d.bold ? 700 : 400,
            fontSize: d.fontSize,
            minHeight: 110,
          }}
        />
      </div>

      {selected && !locked && <StickyToolbar d={d} set={set} />}
    </div>
  );
}

function StickyToolbar({
  d,
  set,
}: {
  d: StickyNoteData;
  set: (patch: Partial<StickyNoteData>) => void;
}) {
  return (
    <div className="nodrag nowheel absolute left-full top-0 z-20 ml-3 flex flex-col items-center gap-1.5 rounded-2xl border border-node-border bg-white p-2 shadow-xl">
      {/* colors */}
      {COLOR_KEYS.map((key) => {
        const c = NOTE_COLORS[key]!;
        return (
          <button
            key={key}
            onClick={() => set({ color: key })}
            title={key}
            className={cn(
              "h-6 w-6 rounded-full border",
              d.color === key
                ? "ring-2 ring-slate-800 ring-offset-1"
                : "border-black/10"
            )}
            style={{ background: c.swatch }}
          />
        );
      })}

      <div className="my-0.5 h-px w-6 bg-node-border" />

      {/* bold */}
      <button
        onClick={() => set({ bold: !d.bold })}
        title="Bold"
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-lg",
          d.bold
            ? "bg-slate-800 text-white"
            : "text-slate-500 hover:bg-slate-100"
        )}
      >
        <Bold className="h-3.5 w-3.5" />
      </button>

      {/* font size */}
      <button
        onClick={() =>
          set({ fontSize: Math.min(MAX_SIZE, d.fontSize + 2) })
        }
        title="Increase size"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-slate-100"
      >
        A+
      </button>
      <span className="text-[11px] tabular-nums text-slate-400">
        {d.fontSize}
      </span>
      <button
        onClick={() =>
          set({ fontSize: Math.max(MIN_SIZE, d.fontSize - 2) })
        }
        title="Decrease size"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-slate-100"
      >
        A−
      </button>

      <div className="my-0.5 h-px w-6 bg-node-border" />

      {/* font family */}
      {FONT_KEYS.map((key) => (
        <button
          key={key}
          onClick={() => set({ fontFamily: key })}
          title={key}
          style={{ fontFamily: FONTS[key] }}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg text-[13px]",
            d.fontFamily === key
              ? "bg-slate-800 text-white"
              : "text-slate-600 hover:bg-slate-100"
          )}
        >
          Aa
        </button>
      ))}
    </div>
  );
}
