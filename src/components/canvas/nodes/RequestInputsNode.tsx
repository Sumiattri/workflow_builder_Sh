"use client";
import { useRef, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import {
  Plus,
  AlignLeft,
  Hash,
  ImageIcon,
  Info,
  Copy,
  Check,
  Trash2,
  GripVertical,
  Loader2,
  Upload,
  Maximize2,
} from "lucide-react";
import { useWorkflowStore, type AppNode } from "@/lib/store";
import {
  type RequestField,
  type RequestFieldType,
  type RequestInputsData,
  outHandle,
} from "@/lib/types";
import { makeRequestField } from "@/lib/node-defs";
import { uploadImage } from "@/lib/transloadit";
import { Handle, Position } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { portColor } from "./PortHandle";
import { useCanvasActions } from "../CanvasContext";

export function RequestInputsNode({ id, data, selected }: NodeProps<AppNode>) {
  const d = data as RequestInputsData;
  const update = useWorkflowStore((s) => s.updateNodeData);
  const runtime = useWorkflowStore((s) => s.runtime[id]);
  const { isRunning, activeScope } = useCanvasActions();
  const locked =
    (isRunning && activeScope !== "SINGLE") ||
    runtime?.status === "PENDING" ||
    runtime?.status === "RUNNING";
  const [adderOpen, setAdderOpen] = useState(false);

  const setFields = (fields: RequestField[]) => update(id, { fields });

  const addField = (type: RequestFieldType) => {
    const count = d.fields.filter((f) => f.fieldType === type).length;
    setFields([...d.fields, makeRequestField(type, count)]);
    setAdderOpen(false);
  };

  const patchField = (fieldId: string, patch: Partial<RequestField>) =>
    setFields(d.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)));

  const removeField = (fieldId: string) =>
    setFields(d.fields.filter((f) => f.id !== fieldId));

  return (
    <NodeShell
      nodeId={id}
      title="Request-Inputs"
      selected={selected}
      deletable={false}
      info="Define the inputs your workflow accepts. Each field exposes an output handle."
      width={340}
      headerRight={
        <button
          onClick={() => setAdderOpen((o) => !o)}
          disabled={locked}
          title="Add field"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-node-border text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      }
    >
      <div className="relative">
        {adderOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setAdderOpen(false)}
            />
            <div className="absolute -top-3 right-0 z-20 w-44 animate-fade-in rounded-xl border border-node-border bg-white p-1.5 shadow-xl">
              <AdderItem
                icon={<AlignLeft className="h-4 w-4" />}
                label="Text"
                onClick={() => addField("text_field")}
              />
              <AdderItem
                icon={<Hash className="h-4 w-4" />}
                label="Number"
                onClick={() => addField("number_field")}
              />
              <AdderItem
                icon={<ImageIcon className="h-4 w-4" />}
                label="Image"
                onClick={() => addField("image_field")}
              />
            </div>
          </>
        )}

        {d.fields.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-slate-400">
            No fields added yet. Click the + icon to add input fields.
          </p>
        ) : (
          <div className="space-y-4">
            {d.fields.map((field) => (
              <FieldEditor
                key={field.id}
                field={field}
                locked={locked}
                onPatch={(p) => patchField(field.id, p)}
                onRemove={() => removeField(field.id)}
              />
            ))}
          </div>
        )}
      </div>
    </NodeShell>
  );
}

function AdderItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] text-slate-800 hover:bg-slate-50"
    >
      <span className="text-slate-400">{icon}</span>
      {label}
    </button>
  );
}

function FieldEditor({
  field,
  locked,
  onPatch,
  onRemove,
}: {
  field: RequestField;
  locked: boolean;
  onPatch: (patch: Partial<RequestField>) => void;
  onRemove: () => void;
}) {
  const portType =
    field.fieldType === "image_field"
      ? "image"
      : field.fieldType === "number_field"
        ? "number"
        : "text";
  const color = portColor(portType);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyValue = () => {
    if (!field.value) return;
    navigator.clipboard
      ?.writeText(field.value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const url = await uploadImage(file);
      onPatch({ value: url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative">
      {/* row header */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-300" />
        <input
          value={field.key}
          disabled={locked}
          onChange={(e) =>
            onPatch({ key: e.target.value, label: e.target.value })
          }
          className="nodrag min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-slate-900 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
        />
        <Info className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={copyValue}
            title="Copy value"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={onRemove}
            disabled={locked}
            title="Delete field"
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* control + edge handle */}
      <div className="relative">
        <Handle
          type="source"
          position={Position.Right}
          id={outHandle(field.id)}
          className="!h-3.5 !w-3.5 !border-2 !border-white"
          style={{
            background: color,
            right: -20,
            left: "auto",
            top: "50%",
            transform: "translateY(-50%)",
            boxShadow: `0 0 0 5px ${color}2b`,
          }}
        />

        {field.fieldType === "text_field" ? (
          <div className="relative">
            <textarea
              value={field.value}
              disabled={locked}
              onChange={(e) => onPatch({ value: e.target.value })}
              placeholder="Enter text…"
              rows={3}
              className="nodrag w-full resize-y rounded-lg border border-node-border bg-slate-50 px-2.5 py-2 text-[13px] text-slate-700 outline-none focus:border-blue-300 focus:bg-white disabled:cursor-not-allowed disabled:text-slate-400"
            />
            <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-slate-400">
              <Maximize2 className="h-3 w-3" />
            </span>
          </div>
        ) : field.fieldType === "number_field" ? (
          <input
            type="number"
            value={field.value}
            disabled={locked}
            onChange={(e) => onPatch({ value: e.target.value })}
            placeholder="0"
            className="nodrag w-full rounded-lg border border-node-border bg-slate-50 px-2.5 py-2 text-[13px] text-slate-700 outline-none focus:border-blue-300 focus:bg-white disabled:cursor-not-allowed disabled:text-slate-400"
          />
        ) : (
          <div className="nodrag">
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
            {field.value ? (
              <div className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={field.value}
                  alt="upload"
                  className="h-28 w-full rounded-lg object-cover"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={locked}
                  className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 text-[12px] font-medium text-transparent transition group-hover:bg-black/40 group-hover:text-white"
                >
                  Replace
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading || locked}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-node-border bg-white text-[13px] text-slate-500 hover:border-blue-300 hover:text-blue-500"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading ? "Uploading…" : "Upload Image"}
              </button>
            )}
            {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
