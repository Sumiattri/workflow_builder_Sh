"use client";
import { useRef, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import {
  Info,
  RotateCcw,
  Plus,
  Upload,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react";
import { useWorkflowStore, type AppNode } from "@/lib/store";
import {
  type CropImageData,
  type CropImageValues,
  type WorkflowGraph,
} from "@/lib/types";
import { getPorts } from "@/lib/node-defs";
import { connectedValueText } from "@/lib/resolve";
import { uploadImage } from "@/lib/transloadit";
import { clamp, cn } from "@/lib/utils";
import { NodeShell, PortRow } from "./NodeShell";
import { PortHandle } from "./PortHandle";
import { useCanvasActions } from "../CanvasContext";

const DEFAULTS: CropImageValues = {
  inputImage: "",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
};

const NUMERIC: Array<{ key: keyof CropImageValues; label: string }> = [
  { key: "x", label: "X Position (%)" },
  { key: "y", label: "Y Position (%)" },
  { key: "width", label: "Width (%)" },
  { key: "height", label: "Height (%)" },
];

function MiniBtn({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick?: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="nodrag flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-node-border text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
    >
      {children}
    </button>
  );
}

/** Live crop-region overlay on the input preview (dims outside the region). */
function CropOverlay({ values }: { values: CropImageValues }) {
  const x = clamp(values.x, 0, 100);
  const y = clamp(values.y, 0, 100);
  const w = clamp(values.width, 0, 100);
  const h = clamp(values.height, 0, 100);
  return (
    <div
      className="pointer-events-none absolute rounded-[2px] border-2 border-indigo-500"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${w}%`,
        height: `${h}%`,
        boxShadow: "0 0 0 9999px rgba(15,23,42,0.45)",
      }}
    />
  );
}

export function CropImageNode({ id, data, selected }: NodeProps<AppNode>) {
  const d = data as CropImageData;
  const update = useWorkflowStore((s) => s.updateNodeData);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const runtime = useWorkflowStore((s) => s.runtime[id]);
  const failed = runtime?.status === "FAILED";
  const { runNodes, isRunning, activeScope } = useCanvasActions();
  const locked =
    (isRunning && activeScope !== "SINGLE") ||
    runtime?.status === "PENDING" ||
    runtime?.status === "RUNNING";
  const { inputs, outputs } = getPorts({ type: "crop-image", data: d });

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const graph = { nodes, edges } as unknown as WorkflowGraph;
  const connected = (portId: string) =>
    edges.some((e) => e.target === id && e.targetHandle === `in:${portId}`);
  const incoming = (portId: string) => connectedValueText(graph, id, portId);

  const setValue = (patch: Partial<CropImageValues>) =>
    update(id, { values: { ...d.values, ...patch } });

  const imgPort = inputs[0]!;
  const outPort = outputs[0]!;
  const imgConnected = connected(imgPort.id);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setValue({ inputImage: url });
    } catch {
      /* surfaced elsewhere */
    } finally {
      setUploading(false);
    }
  };

  return (
    <NodeShell
      nodeId={id}
      title="Crop Image"
      selected={selected}
      onRun={() => runNodes([id], "SINGLE")}
      width={380}
      headerRight={
        <>
          <span
            title="Crop an image by X / Y / Width / Height (%)."
            className="text-slate-300"
          >
            <Info className="h-4 w-4" />
          </span>
          <MiniBtn
            title="Reset all"
            disabled={locked}
            onClick={() => update(id, { values: { ...DEFAULTS }, output: undefined })}
          >
            <RotateCcw className="h-4 w-4" />
          </MiniBtn>
        </>
      }
    >
      <div className="space-y-3">
        {/* Input Image */}
        <div className="relative flex items-center gap-2">
          <PortHandle port={imgPort} dir="in" />
          <label className="flex w-28 shrink-0 items-center gap-0.5 text-[12px] font-medium text-slate-600">
            {imgPort.label}
            <span className="text-red-400">*</span>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <button
            disabled={imgConnected || locked}
            onClick={() => fileRef.current?.click()}
            className="nodrag flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-node-border bg-white text-[12px] text-slate-500 hover:border-blue-300 hover:text-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          >
            {imgConnected ? (
              "Connected"
            ) : uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
              </>
            ) : d.values.inputImage ? (
              <>
                <Upload className="h-3.5 w-3.5" /> Change Image
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" /> Upload Image
              </>
            )}
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* reset-column spacer so the + lines up with the rows below */}
            <span className="h-8 w-8" aria-hidden />
            <MiniBtn title="Add input" disabled={locked}>
              <Plus className="h-4 w-4" />
            </MiniBtn>
          </div>
        </div>

        {/* uploaded image preview */}
        {!imgConnected && d.values.inputImage && (
          <div className="relative overflow-hidden rounded-lg border border-node-border bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={d.values.inputImage}
              alt="input preview"
              className="block w-full"
            />
            <CropOverlay values={d.values} />
            <button
              onClick={() => setValue({ inputImage: "" })}
              disabled={locked}
              title="Remove image"
              style={{ backgroundColor: "#666666" }}
              className="nodrag absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* connected input image preview */}
        {imgConnected && incoming(imgPort.id) && (
          <div className="relative overflow-hidden rounded-lg border border-node-border bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={incoming(imgPort.id)}
              alt="connected input"
              className="block w-full opacity-90"
            />
            <CropOverlay values={d.values} />
          </div>
        )}

        {/* X / Y / Width / Height */}
        {NUMERIC.map((f, i) => {
          const port = inputs[i + 1]!;
          const isConn = connected(port.id);
          const manual = d.values[f.key] as number;
          const connNum = isConn ? Number(incoming(port.id)) : NaN;
          const value = Number.isFinite(connNum) ? connNum : manual;
          return (
            <div key={f.key} className="relative flex items-center gap-2">
              <PortHandle port={port} dir="in" />
              <label className="flex w-28 shrink-0 items-center gap-1 text-[12px] font-medium text-slate-600">
                {f.label}
                <Info className="h-3 w-3 text-slate-300" />
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={value}
                disabled={isConn || locked}
                onChange={(e) =>
                  setValue({ [f.key]: clamp(Number(e.target.value), 0, 100) })
                }
                className="nodrag h-1.5 min-w-0 flex-1 accent-indigo-500 disabled:opacity-40"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={value}
                disabled={isConn || locked}
                onChange={(e) =>
                  setValue({ [f.key]: clamp(Number(e.target.value), 0, 100) })
                }
                className="nodrag w-14 shrink-0 rounded-lg border border-node-border bg-white px-2 py-1.5 text-center text-[12px] text-slate-700 outline-none focus:border-blue-300 disabled:bg-slate-50 disabled:text-slate-400"
              />
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <MiniBtn
                  title="Reset"
                  disabled={locked}
                  onClick={() => setValue({ [f.key]: DEFAULTS[f.key] })}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </MiniBtn>
                <MiniBtn title="Add input" disabled={locked}>
                  <Plus className="h-4 w-4" />
                </MiniBtn>
              </div>
            </div>
          );
        })}

        {/* Output */}
        <div className="mt-1 border-t border-node-border pt-3">
          <PortRow className="!py-0">
            <span className="text-[12px] font-medium text-slate-600">
              {outPort.label}
            </span>
            <div className="ml-auto" />
            <PortHandle port={outPort} dir="out" />
          </PortRow>
          <div
            className={cn(
              "mt-2 rounded-xl border bg-white p-2",
              failed ? "border-red-200 bg-red-50/50" : "border-node-border"
            )}
          >
            {failed ? (
              <div className="flex min-h-[80px] items-start gap-1.5 p-1 text-[12px] text-red-600">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-pre-wrap">
                  {runtime?.error ?? "Run failed"}
                </span>
              </div>
            ) : d.output ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={d.output}
                alt="cropped"
                className="h-32 w-full rounded-lg object-contain"
              />
            ) : (
              <div className="flex h-32 items-center justify-center text-[12px] text-slate-300">
                No output yet
              </div>
            )}
          </div>
          <div className="mt-2 text-right text-[11px] text-slate-300">
            ~0.005 M
          </div>
        </div>
      </div>
    </NodeShell>
  );
}
