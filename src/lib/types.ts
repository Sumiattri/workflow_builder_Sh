// ─────────────────────────────────────────────────────────────
// NextFlow — core domain types
// ─────────────────────────────────────────────────────────────

/** Data type carried by a handle. Used for type-safe connections. */
export type PortType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "number"
  | "any";

export type NodeType =
  | "request-inputs"
  | "crop-image"
  | "gemini"
  | "response"
  | "sticky-note";

/** A single input or output handle on a node. */
export interface Port {
  /** stable id, unique within the node */
  id: string;
  label: string;
  type: PortType;
  required?: boolean;
  /** accepts multiple incoming connections (e.g. Gemini Vision) */
  multi?: boolean;
}

// ── Per-node data shapes ─────────────────────────────────────

export type RequestFieldType = "text_field" | "number_field" | "image_field";

export interface RequestField {
  /** also used as the output handle id */
  id: string;
  /** machine key shown on the handle, e.g. text_field, image_field_2 */
  key: string;
  label: string;
  fieldType: RequestFieldType;
  /** text content, or uploaded image URL */
  value: string;
}

// NOTE: node `data` shapes are `type` aliases (not interfaces) so they satisfy
// React Flow v12's `Record<string, unknown>` data constraint.
export type RequestInputsData = {
  fields: RequestField[];
};

export interface CropImageValues {
  inputImage: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CropImageData = {
  values: CropImageValues;
  /** resolved cropped image url after execution */
  output?: string;
};

export interface GeminiSettings {
  temperature: number;
  maxOutputTokens: number;
  topP: number;
  topK: number;
  frequencyPenalty: number;
  presencePenalty: number;
  seed: number;
}

export interface GeminiValues {
  prompt: string;
  systemPrompt: string;
  // manually-uploaded multimodal inputs (used when the handle isn't connected)
  image?: string;
  video?: string;
  audio?: string;
  file?: string;
}

export type GeminiData = {
  model: string;
  values: GeminiValues;
  settings: GeminiSettings;
  settingsOpen: boolean;
  /** inline rendered response after execution */
  response?: string;
};

export type ResponseData = {
  /** captured final result(s) for display/export */
  result?: unknown;
};

/** A non-executable canvas annotation. */
export type StickyNoteData = {
  text: string;
  color: string; // preset key (yellow/blue/green/pink/purple/orange)
  bold: boolean;
  fontSize: number;
  fontFamily: string; // preset key (sans/serif/mono/cursive)
};

export type NodeData =
  | RequestInputsData
  | CropImageData
  | GeminiData
  | ResponseData
  | StickyNoteData;

// ── Graph (what we persist) ──────────────────────────────────

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
  /** Request-Inputs and Response cannot be removed */
  deletable?: boolean;
}

export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface WorkflowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

// ── Run / history ────────────────────────────────────────────

export type RunStatus = "RUNNING" | "SUCCESS" | "FAILED" | "PARTIAL";
export type RunScope = "FULL" | "PARTIAL" | "SINGLE";
export type NodeRunStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED";

export interface NodeRunDTO {
  id: string;
  nodeId: string;
  nodeType: string;
  label: string;
  status: NodeRunStatus;
  inputs?: unknown;
  output?: unknown;
  error?: string | null;
  durationMs?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface RunDTO {
  id: string;
  status: RunStatus;
  scope: RunScope;
  durationMs?: number | null;
  startedAt: string;
  finishedAt?: string | null;
  nodeRuns: NodeRunDTO[];
}

export interface WorkflowDTO {
  id: string;
  name: string;
  graph: WorkflowGraph;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowListItem {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  hasActiveRun: boolean;
}

// ── Handle id encoding ───────────────────────────────────────
// React Flow handle ids encode direction + port: "in:<portId>" / "out:<portId>"

export function inHandle(portId: string): string {
  return `in:${portId}`;
}
export function outHandle(portId: string): string {
  return `out:${portId}`;
}
export function parseHandle(
  handleId: string | null | undefined
): { dir: "in" | "out"; portId: string } | null {
  if (!handleId) return null;
  const idx = handleId.indexOf(":");
  if (idx === -1) return null;
  const dir = handleId.slice(0, idx);
  if (dir !== "in" && dir !== "out") return null;
  return { dir, portId: handleId.slice(idx + 1) };
}
