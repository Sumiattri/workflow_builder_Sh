"use client";
import { useRef, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Upload,
  Loader2,
  X,
  AlertCircle,
  Info,
  RotateCcw,
} from "lucide-react";
import { useWorkflowStore, type AppNode } from "@/lib/store";
import {
  type GeminiData,
  type GeminiSettings,
  type GeminiValues,
  type Port,
  type WorkflowGraph,
} from "@/lib/types";
import {
  getPorts,
  GEMINI_MODELS,
  DEFAULT_GEMINI_SETTINGS,
} from "@/lib/node-defs";
import { connectedValueText } from "@/lib/resolve";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/transloadit";
import { NodeShell, PortRow } from "./NodeShell";
import { PortHandle } from "./PortHandle";
import { useCanvasActions } from "../CanvasContext";

const MEDIA_ACCEPT: Record<string, string | undefined> = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
  file: undefined,
};

type SettingKey = keyof GeminiSettings;
interface SettingDef {
  key: SettingKey;
  label: string;
  kind: "slider" | "number";
  min?: number;
  max?: number;
  step?: number;
}

// Only parameters the Gemini API actually honors.
const SETTING_DEFS: SettingDef[] = [
  { key: "temperature", label: "Temperature", kind: "slider", min: 0, max: 2, step: 0.1 },
  { key: "maxOutputTokens", label: "Max Tokens", kind: "number" },
  { key: "topP", label: "Top P", kind: "slider", min: 0, max: 1, step: 0.05 },
  { key: "topK", label: "Top K", kind: "slider", min: 0, max: 100, step: 1 },
  { key: "frequencyPenalty", label: "Frequency Penalty", kind: "slider", min: -2, max: 2, step: 0.1 },
  { key: "presencePenalty", label: "Presence Penalty", kind: "slider", min: -2, max: 2, step: 0.1 },
  { key: "seed", label: "Seed", kind: "number" },
];

const MD_IMAGE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
const BARE_IMAGE =
  /(https?:\/\/[^\s)]+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)]*)?)/gi;

/** Pull image links out of a response and return the prose + image urls. */
function parseResponse(response: string): { text: string; images: string[] } {
  const images = new Set<string>();
  let m: RegExpExecArray | null;
  MD_IMAGE.lastIndex = 0;
  while ((m = MD_IMAGE.exec(response))) images.add(m[1]!);
  BARE_IMAGE.lastIndex = 0;
  while ((m = BARE_IMAGE.exec(response))) images.add(m[1]!);
  const text = response.replace(MD_IMAGE, "").trim();
  return { text, images: Array.from(images) };
}

function MiniBtn({
  onClick,
  title,
  className,
  disabled,
  children,
}: {
  onClick?: () => void;
  title: string;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "nodrag flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-node-border text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400",
        className
      )}
    >
      {children}
    </button>
  );
}

export function GeminiNode({ id, data, selected }: NodeProps<AppNode>) {
  const d = data as GeminiData;
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
  const { inputs, outputs } = getPorts({ type: "gemini", data: d });

  const graph = { nodes, edges } as unknown as WorkflowGraph;
  const connected = (portId: string) =>
    edges.some((e) => e.target === id && e.targetHandle === `in:${portId}`);
  const incoming = (portId: string) => connectedValueText(graph, id, portId);

  const settings = { ...DEFAULT_GEMINI_SETTINGS, ...d.settings };
  const setValue = (patch: Partial<GeminiValues>) =>
    update(id, { values: { ...d.values, ...patch } });
  const setSettings = (patch: Partial<GeminiSettings>) =>
    update(id, { settings: { ...settings, ...patch } });

  const textPorts = inputs.filter((p) => p.type === "text");
  const mediaPorts = inputs.filter((p) => p.type !== "text");
  const outPort = outputs[0]!;

  return (
    <NodeShell
      nodeId={id}
      title="Gemini 3.1 Pro"
      selected={selected}
      onRun={() => runNodes([id], "SINGLE")}
      width={340}
      headerRight={
        <select
          value={d.model}
          disabled={locked}
          onChange={(e) => update(id, { model: e.target.value })}
          className="nodrag rounded-md border border-node-border bg-white px-1.5 py-0.5 text-[11px] text-slate-600 outline-none focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {GEMINI_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      }
    >
      <div className="space-y-1">
        {/* text inputs with manual entry */}
        {textPorts.map((port) => {
          const isConn = connected(port.id);
          const key = port.id as keyof GeminiValues;
          return (
            <PortRow key={port.id} className="!block">
              <PortHandle port={port} dir="in" />
              <div className="mb-1 flex items-center gap-2">
                <label className="flex flex-1 items-center gap-1 text-[12px] font-medium text-slate-600">
                  {port.label}
                  {port.required && <span className="text-red-400">*</span>}
                </label>
                <MiniBtn title="Add input" disabled={locked}>
                  <Plus className="h-4 w-4" />
                </MiniBtn>
              </div>
              <textarea
                value={isConn ? incoming(port.id) : d.values[key]}
                disabled={isConn || locked}
                onChange={(e) => setValue({ [key]: e.target.value })}
                placeholder={
                  isConn
                    ? "Waiting for connected value…"
                    : `Enter ${port.label.toLowerCase()}…`
                }
                rows={2}
                className="nodrag w-full resize-y rounded-md border border-node-border bg-slate-50 px-2 py-1 text-[12px] text-slate-700 outline-none focus:border-blue-300 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              />
            </PortRow>
          );
        })}

        {/* media inputs (connection OR upload) */}
        <div className="mt-1 space-y-2">
          {mediaPorts.map((port) => (
            <MediaInput
              key={port.id}
              port={port}
              value={d.values[port.id as keyof GeminiValues] as string | undefined}
              connected={connected(port.id)}
              connectedValue={incoming(port.id)}
              locked={locked}
              onChange={(url) =>
                setValue({ [port.id]: url } as Partial<GeminiValues>)
              }
            />
          ))}
        </div>

        {/* settings */}
        <div className="my-3">
          <button
            onClick={() => update(id, { settingsOpen: !d.settingsOpen })}
            disabled={locked}
            className="nodrag flex items-center gap-1.5 py-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {d.settingsOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Settings
          </button>
          {d.settingsOpen && (
            <div className="mt-3 space-y-3">
              {SETTING_DEFS.map((def) => (
                <SettingRow
                  key={def.key}
                  def={def}
                  value={settings[def.key]}
                  locked={locked}
                  onChange={(v) =>
                    setSettings({ [def.key]: v } as Partial<GeminiSettings>)
                  }
                  onReset={() =>
                    setSettings({
                      [def.key]: DEFAULT_GEMINI_SETTINGS[def.key],
                    } as Partial<GeminiSettings>)
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* response output */}
        <div className="mt-2 border-t border-node-border pt-3">
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
              <div className="flex items-start gap-1.5 text-[12px] text-red-600">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-pre-wrap">
                  {runtime?.error ?? "Run failed"}
                </span>
              </div>
            ) : d.response ? (
              (() => {
                const { text, images } = parseResponse(d.response);
                return (
                  <div className="nowheel max-h-64 space-y-2 overflow-y-auto scrollbar-thin">
                    {text && (
                      <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700">
                        {text}
                      </div>
                    )}
                    {images.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={url}
                        alt="response"
                        className="w-full rounded-md object-contain"
                      />
                    ))}
                  </div>
                );
              })()
            ) : (
              <div className="flex min-h-[72px] items-center justify-center text-[12px] text-slate-300">
                No output yet
              </div>
            )}
          </div>
        </div>
      </div>
    </NodeShell>
  );
}

function MediaInput({
  port,
  value,
  connected,
  connectedValue,
  locked,
  onChange,
}: {
  port: Port;
  value?: string;
  connected: boolean;
  connectedValue?: string;
  locked: boolean;
  onChange: (url: string | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = MEDIA_ACCEPT[port.id];
  const isImage = port.id === "image";
  const shortLabel = port.label.replace(" (Vision)", "");

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="relative mb-1 flex items-center gap-1.5">
        <PortHandle port={port} dir="in" />
        <span className="text-[12px] font-medium text-slate-600">
          {port.label}
        </span>
        {port.multi && (
          <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-400">
            multi
          </span>
        )}
        <MiniBtn title="Add input" className="ml-auto" disabled={locked}>
          <Plus className="h-4 w-4" />
        </MiniBtn>
      </div>

      {connected ? (
        isImage && connectedValue ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={connectedValue}
            alt="connected"
            className="h-24 w-full rounded-md object-cover opacity-90"
          />
        ) : (
          <div className="truncate rounded-md border border-node-border bg-slate-100 px-2 py-1.5 text-[12px] text-slate-400">
            {connectedValue ? connectedValue : "Connected"}
          </div>
        )
      ) : value ? (
        <div className="nodrag relative">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt="upload"
              className="h-24 w-full rounded-md object-cover"
            />
          ) : (
            <div className="truncate rounded-md border border-node-border bg-slate-50 px-2 py-2 text-[12px] text-slate-600">
              {shortLabel} uploaded
            </div>
          )}
          <button
            onClick={() => onChange(undefined)}
            disabled={locked}
            title="Remove"
            style={{ backgroundColor: "#666666" }}
            className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || locked}
            className="nodrag flex h-10 w-full items-center justify-center gap-2 rounded-md border border-dashed border-node-border bg-white text-[12px] text-slate-500 hover:border-blue-300 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" /> Upload {shortLabel}
              </>
            )}
          </button>
          {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
        </>
      )}
    </div>
  );
}

function SettingRow({
  def,
  value,
  locked,
  onChange,
  onReset,
}: {
  def: SettingDef;
  value: number;
  locked: boolean;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const dotColor = "#ec4899";
  return (
    <div className="relative flex items-center gap-2">
      <span
        className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white"
        style={{
          left: -20,
          background: dotColor,
          boxShadow: `0 0 0 4px ${dotColor}22`,
        }}
      />
      <label className="flex min-w-0 flex-1 items-center gap-1 text-[12px] font-medium text-slate-600">
        <span className="truncate">{def.label}</span>
        <Info className="h-3 w-3 shrink-0 text-slate-300" />
      </label>

      {def.kind === "slider" ? (
        <>
          <input
            type="range"
            min={def.min}
            max={def.max}
            step={def.step}
            value={value}
            disabled={locked}
            onChange={(e) => onChange(Number(e.target.value))}
            className="nodrag h-1.5 w-16 shrink-0 accent-indigo-500 disabled:opacity-40"
          />
          <input
            type="number"
            value={value}
            disabled={locked}
            onChange={(e) => onChange(Number(e.target.value))}
            className="nodrag w-12 shrink-0 rounded-lg border border-node-border bg-white px-1.5 py-1 text-center text-[12px] text-slate-700 outline-none focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <MiniBtn title="Reset" onClick={onReset} disabled={locked}>
            <RotateCcw className="h-3.5 w-3.5" />
          </MiniBtn>
          <MiniBtn title="Add input" disabled={locked}>
            <Plus className="h-4 w-4" />
          </MiniBtn>
        </>
      ) : (
        <>
          <input
            type="number"
            value={value}
            disabled={locked}
            onChange={(e) => onChange(Number(e.target.value))}
            className="nodrag w-24 shrink-0 rounded-lg border border-node-border bg-white px-2 py-1.5 text-center text-[12px] text-slate-700 outline-none focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <MiniBtn title="Add input" disabled={locked}>
            <Plus className="h-4 w-4" />
          </MiniBtn>
        </>
      )}
    </div>
  );
}
