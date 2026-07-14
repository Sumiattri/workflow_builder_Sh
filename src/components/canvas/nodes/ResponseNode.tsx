"use client";
import { type NodeProps } from "@xyflow/react";
import { FileOutput, AlertCircle, Trash2 } from "lucide-react";
import { useWorkflowStore, type AppNode } from "@/lib/store";
import { type ResponseData, type WorkflowGraph } from "@/lib/types";
import { getPorts } from "@/lib/node-defs";
import { connectedSources } from "@/lib/resolve";
import { NodeShell, PortRow } from "./NodeShell";
import { PortHandle } from "./PortHandle";
import { useCanvasActions } from "../CanvasContext";

function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ResponseNode({ id, data, selected }: NodeProps<AppNode>) {
  const d = data as ResponseData;
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const runtime = useWorkflowStore((s) => s.runtime[id]);
  const { isRunning, activeScope } = useCanvasActions();
  const locked =
    (isRunning && activeScope !== "SINGLE") ||
    runtime?.status === "PENDING" ||
    runtime?.status === "RUNNING";
  const { inputs } = getPorts({ type: "response", data: d });
  const port = inputs[0]!;

  const graph = { nodes, edges } as unknown as WorkflowGraph;
  const sources = connectedSources(graph, id, port.id);

  return (
    <NodeShell
      nodeId={id}
      title="Response"
      selected={selected}
      deletable={false}
      icon={
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-50 text-indigo-500">
          <FileOutput className="h-3.5 w-3.5" />
        </span>
      }
      info="Collects the final workflow output for display and export."
      width={300}
    >
      <PortRow>
        <PortHandle port={port} dir="in" />
        <span className="text-[12px] font-medium text-slate-600">
          {port.label}
        </span>
      </PortRow>

      <div className="mt-2 border-t border-node-border pt-3">
        {runtime?.status === "FAILED" ? (
          <div className="flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-[12px] text-red-600">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-pre-wrap">
              {runtime?.error ?? "Run failed"}
            </span>
          </div>
        ) : runtime?.status === "SKIPPED" ? (
          <p className="py-3 text-center text-[12px] text-amber-500">
            Skipped (an upstream node failed)
          </p>
        ) : sources.length === 0 ? (
          <p className="py-3 text-center text-[12px] text-slate-400">
            No output added yet
          </p>
        ) : (
          <div className="space-y-2">
            {sources.map((s) => (
              <div
                key={s.edgeId}
                className="rounded-lg border border-node-border bg-white p-2"
              >
                <div className="mb-1.5 flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium text-slate-600">
                    {s.label}
                  </span>
                  <button
                    onClick={() =>
                      onEdgesChange([{ type: "remove", id: s.edgeId }])
                    }
                    disabled={locked}
                    title="Remove connection"
                    className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {s.value == null || s.value === "" ? (
                  <p className="rounded-md bg-slate-50 px-2 py-1.5 text-[12px] text-slate-300">
                    No output yet
                  </p>
                ) : s.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asText(s.value)}
                    alt={s.label}
                    className="w-full rounded-md object-contain"
                  />
                ) : (
                  <div className="nowheel max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 px-2 py-1.5 text-[12px] leading-relaxed text-slate-700 scrollbar-thin">
                    {asText(s.value)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </NodeShell>
  );
}
