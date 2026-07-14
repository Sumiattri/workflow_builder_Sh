"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search, X, Clock, Wrench, Brain, Crop, Sparkles } from "lucide-react";
import {
  PICKER_CATEGORIES,
  PICKER_ITEMS,
  type PickerCategory,
  type PickerItem,
} from "@/lib/node-defs";
import { type NodeType } from "@/lib/types";
import { cn } from "@/lib/utils";

const RECENT_KEY = "nextflow:recent-nodes";
const RECENT_MAX = 4;

function itemIcon(type: NodeType) {
  switch (type) {
    case "crop-image":
      return <Crop className="h-5 w-5 text-slate-500" />;
    case "gemini":
      return <Sparkles className="h-5 w-5 text-indigo-500" />;
    default:
      return <Sparkles className="h-5 w-5 text-slate-500" />;
  }
}

const CAT_META: Record<PickerCategory, { label: string; icon: ReactNode }> = {
  Utility: { label: "Utility", icon: <Wrench className="h-3.5 w-3.5" /> },
  LLM: { label: "LLM", icon: <Brain className="h-3.5 w-3.5" /> },
};

function readRecent(): NodeType[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((t): t is NodeType =>
      PICKER_ITEMS.some((i) => i.type === t)
    );
  } catch {
    return [];
  }
}

function SectionHeader({
  icon,
  label,
  uppercase,
}: {
  icon: ReactNode;
  label: string;
  uppercase?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-4 pb-1 pt-3 text-slate-400">
      {icon}
      <span
        className={cn(
          "text-[12px] font-semibold tracking-wide",
          uppercase && "uppercase"
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function NodePicker({
  onAdd,
  onClose,
}: {
  onAdd: (type: NodeType) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<NodeType[]>([]);

  useEffect(() => setRecent(readRecent()), []);

  const add = (item: PickerItem) => {
    if (!item.enabled) return;
    try {
      const next = [item.type, ...recent.filter((t) => t !== item.type)].slice(
        0,
        RECENT_MAX
      );
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignore storage errors */
    }
    onAdd(item.type);
    onClose();
  };

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      q
        ? PICKER_ITEMS.filter(
            (i) =>
              i.label.toLowerCase().includes(q) ||
              i.description.toLowerCase().includes(q)
          )
        : null,
    [q]
  );

  const recentItems = recent
    .map((t) => PICKER_ITEMS.find((i) => i.type === t))
    .filter((i): i is PickerItem => Boolean(i));

  const Row = ({ item }: { item: PickerItem }) => (
    <button
      disabled={!item.enabled}
      onClick={() => add(item)}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2 text-left",
        item.enabled ? "hover:bg-slate-50" : "cursor-not-allowed opacity-40"
      )}
    >
      {itemIcon(item.type)}
      <span className="text-[15px] text-slate-800">{item.label}</span>
    </button>
  );

  return (
    <div className="w-[280px] animate-fade-in overflow-hidden rounded-2xl border border-node-border bg-white shadow-2xl">
      {/* search */}
      <div className="flex items-center gap-3 border-b border-node-border px-4 py-3.5">
        <Search className="h-5 w-5 text-slate-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes or models..."
          className="w-full bg-transparent text-[15px] text-slate-700 outline-none placeholder:text-slate-400"
        />
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="max-h-[440px] overflow-y-auto pb-2 scrollbar-thin">
        {results ? (
          results.length > 0 ? (
            <div className="pt-2">
              {results.map((item) => (
                <Row key={item.type} item={item} />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-[14px] text-slate-400">
              No nodes found
            </p>
          )
        ) : (
          <>
            {recentItems.length > 0 && (
              <div>
                <SectionHeader
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Recent"
                />
                {recentItems.map((item) => (
                  <Row key={`recent-${item.type}`} item={item} />
                ))}
              </div>
            )}

            {PICKER_CATEGORIES.map((cat) => {
              const items = PICKER_ITEMS.filter((i) => i.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat}>
                  <SectionHeader
                    icon={CAT_META[cat].icon}
                    label={CAT_META[cat].label}
                    uppercase
                  />
                  {items.map((item) => (
                    <Row key={item.type} item={item} />
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
