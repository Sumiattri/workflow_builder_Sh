"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  History,
} from "lucide-react";
import {
  type NodeRunDTO,
  type NodeRunStatus,
  type RunDTO,
  type RunStatus,
} from "@/lib/types";
import { cn, formatDuration, formatTimestamp, truncate } from "@/lib/utils";

const RUN_BADGE: Record<RunStatus, string> = {
  SUCCESS: "bg-emerald-50 text-emerald-600 border-emerald-200",
  FAILED: "bg-red-50 text-red-600 border-red-200",
  PARTIAL: "bg-amber-50 text-amber-600 border-amber-200",
  RUNNING: "bg-blue-50 text-blue-600 border-blue-200",
};

function NodeStatusIcon({ status }: { status: NodeRunStatus }) {
  switch (status) {
    case "SUCCESS":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "FAILED":
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case "RUNNING":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
    case "SKIPPED":
      return <AlertTriangle className="h-3.5 w-3.5 text-slate-300" />;
    default:
      return <span className="h-3.5 w-3.5 rounded-full border border-slate-200" />;
  }
}

function summarizeOutput(nr: NodeRunDTO): string {
  const out = nr.output as Record<string, unknown> | null;
  if (!out) return "";
  if (typeof out.output === "string") return out.output;
  if (typeof out.response === "string") return truncate(out.response, 60);
  if (out.result !== undefined) return truncate(JSON.stringify(out.result), 60);
  // request-inputs: field map
  return Object.keys(out).join(", ");
}

export function HistoryPanel({
  workflowId,
  refreshKey,
  isRunning,
  onClose,
}: {
  workflowId: string;
  refreshKey: number;
  isRunning: boolean;
  onClose: () => void;
}) {
  const [runs, setRuns] = useState<RunDTO[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}/runs`, {
        cache: "no-store",
      });
      if (res.ok) setRuns(await res.json());
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const hasRunningRun = runs.some((run) => run.status === "RUNNING");
    if (!isRunning && !hasRunningRun) return;

    const interval = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(interval);
  }, [isRunning, load, runs]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-node-border bg-white">
      <div className="flex items-center gap-2 border-b border-node-border px-4 py-3">
        <History className="h-4 w-4 text-slate-500" />
        <h2 className="text-[14px] font-semibold text-slate-800">History</h2>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        {loading ? (
          <p className="py-8 text-center text-[13px] text-slate-400">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-slate-400">
            No runs yet. Run the workflow to see history.
          </p>
        ) : (
          <div className="space-y-1.5">
            {runs.map((run, idx) => {
              const isOpen = expanded.has(run.id);
              return (
                <div
                  key={run.id}
                  className="rounded-lg border border-node-border"
                >
                  <button
                    onClick={() => toggle(run.id)}
                    className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    <span className="text-[12px] font-medium text-slate-700">
                      Run #{runs.length - idx}
                    </span>
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                        RUN_BADGE[run.status]
                      )}
                    >
                      {run.status === "RUNNING" && (
                        <Loader2 className="mr-0.5 inline h-2.5 w-2.5 animate-spin" />
                      )}
                      {run.status}
                    </span>
                    <span className="ml-auto text-[10px] text-slate-400">
                      {formatDuration(run.durationMs)}
                    </span>
                  </button>

                  <div className="px-2.5 pb-1 text-[10px] text-slate-400">
                    {formatTimestamp(run.startedAt)} ·{" "}
                    <span className="uppercase">{run.scope}</span>
                  </div>

                  {isOpen && (
                    <div className="border-t border-node-border px-2 py-1.5">
                      {run.nodeRuns.map((nr) => (
                        <div key={nr.id} className="py-1">
                          <div className="flex items-center gap-2">
                            <NodeStatusIcon status={nr.status} />
                            <span className="text-[12px] font-medium text-slate-700">
                              {nr.label}
                            </span>
                            <span className="ml-auto text-[10px] tabular-nums text-slate-400">
                              {formatDuration(nr.durationMs)}
                            </span>
                          </div>
                          {nr.error ? (
                            <p className="ml-5 mt-0.5 text-[11px] text-red-500">
                              {nr.error}
                            </p>
                          ) : (
                            summarizeOutput(nr) && (
                              <p className="ml-5 mt-0.5 break-words text-[11px] text-slate-500">
                                → {summarizeOutput(nr)}
                              </p>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
