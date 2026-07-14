"use client";
import { useState, type ReactNode } from "react";
import {
  MoreVertical,
  Trash2,
  Copy,
  Play,
  Info,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { useWorkflowStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { type NodeRunStatus } from "@/lib/types";
import { useCanvasActions } from "../CanvasContext";

function StatusBadge({ status }: { status: NodeRunStatus }) {
  switch (status) {
    case "RUNNING":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />;
    case "SUCCESS":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "FAILED":
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    default:
      return null;
  }
}

export function NodeShell({
  nodeId,
  title,
  selected,
  deletable = true,
  icon,
  info,
  headerRight,
  onRun,
  children,
  width = 320,
}: {
  nodeId: string;
  title: string;
  selected?: boolean;
  deletable?: boolean;
  icon?: ReactNode;
  info?: string;
  headerRight?: ReactNode;
  onRun?: () => void;
  children: ReactNode;
  width?: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const removeNodes = useWorkflowStore((s) => s.removeNodes);
  const duplicateNodes = useWorkflowStore((s) => s.duplicateNodes);
  const runtime = useWorkflowStore((s) => s.runtime[nodeId]);
  const status = runtime?.status;
  const { cancel, activeRunId, activeScope, readOnly, isRunning } =
    useCanvasActions();
  const inRun = status === "PENDING" || status === "RUNNING";
  // during a full workflow run, only the top-bar Cancel works
  const cancelable = inRun && !!activeRunId && activeScope !== "FULL";
  const starting = status === "PENDING" && !activeRunId;
  const runDisabled = isRunning && activeScope !== "SINGLE";
  const actionLocked = (isRunning && activeScope !== "SINGLE") || inRun;

  const ringClass =
    status === "RUNNING"
      ? "animate-node-glow border-indigo-400"
      : status === "SUCCESS"
        ? "border-emerald-300 ring-1 ring-emerald-200"
        : status === "FAILED"
          ? "border-red-300 ring-1 ring-red-200"
          : selected
            ? "border-indigo-400 ring-2 ring-indigo-200"
            : "border-node-border";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-node shadow-[0_4px_16px_rgba(16,24,40,0.08),0_1px_3px_rgba(16,24,40,0.06)] transition-shadow",
        ringClass
      )}
      style={{ width }}
    >
      {/* header */}
      <div className="flex items-center gap-1.5 rounded-t-2xl px-3.5 py-2.5">
        {icon}
        <span className="truncate text-[13px] font-semibold text-slate-800">
          {title}
        </span>
        {info && (
          <span title={info} className="text-slate-300">
            <Info className="h-3.5 w-3.5" />
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {status && !(onRun && inRun) && <StatusBadge status={status} />}
          {headerRight}
          {onRun &&
            !readOnly &&
            (inRun ? (
              <button
                onClick={cancelable ? () => cancel(nodeId) : undefined}
                disabled={!cancelable}
                title={
                  activeScope === "FULL"
                    ? "Cancel the workflow run from the top bar"
                    : cancelable
                      ? "Cancel run"
                      : "Starting…"
                }
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[13px] font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-red-50"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {starting ? "Starting" : "Cancel"}
              </button>
            ) : (
              <button
                onClick={onRun}
                disabled={runDisabled}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[13px] font-medium text-emerald-600 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-50"
                title={
                  runDisabled
                    ? "Wait for the current workflow run to finish"
                    : "Run this node"
                }
              >
                <Play className="h-3.5 w-3.5 fill-emerald-600" />
                Run
              </button>
            ))}
          {deletable && !readOnly && !actionLocked && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-node-border text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-7 z-10 w-36 animate-fade-in rounded-lg border border-node-border bg-white py-1 shadow-lg">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      duplicateNodes([nodeId], false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Duplicate
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      removeNodes([nodeId]);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="h-px bg-node-border/70" />

      {/* body */}
      <div className="px-3.5 py-3">{children}</div>
    </div>
  );
}

/** A labeled input/output row with its handle. */
export function PortRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative flex items-center py-1.5", className)}>
      {children}
    </div>
  );
}
