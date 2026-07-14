// ─────────────────────────────────────────────────────────────
// Resolve a node's effective inputs from (a) connected upstream
// outputs and (b) manual field values. A connected handle always
// wins over the manual value (and the manual field is greyed out
// in the UI).
// ─────────────────────────────────────────────────────────────
import { getPorts } from "./node-defs";
import {
  type CropImageData,
  type FlowNode,
  type GeminiData,
  type RequestInputsData,
  type WorkflowGraph,
  parseHandle,
} from "./types";

export type OutputsByNode = Record<string, Record<string, unknown>>;

/** Current output value of a source node for a given output port id. */
export function sourceOutputValue(node: FlowNode, portId: string): unknown {
  switch (node.type) {
    case "request-inputs": {
      const f = (node.data as RequestInputsData).fields.find(
        (x) => x.id === portId
      );
      return f?.value;
    }
    case "gemini":
      return (node.data as GeminiData).response;
    case "crop-image":
      return (node.data as CropImageData).output;
    default:
      return undefined;
  }
}

/**
 * Live preview of the value(s) flowing into an input port from connected
 * upstream nodes — used to show the received value in a disabled field.
 */
export function connectedValues(
  graph: WorkflowGraph,
  nodeId: string,
  portId: string
): unknown[] {
  return graph.edges
    .filter((e) => e.target === nodeId && e.targetHandle === `in:${portId}`)
    .map((e) => {
      const sh = parseHandle(e.sourceHandle);
      if (!sh) return undefined;
      const src = graph.nodes.find((n) => n.id === e.source);
      if (!src) return undefined;
      return sourceOutputValue(src, sh.portId);
    })
    .filter((v) => v !== undefined && v !== null && v !== "");
}

/** First connected value as a display string ("" if none yet). */
export function connectedValueText(
  graph: WorkflowGraph,
  nodeId: string,
  portId: string
): string {
  const v = connectedValues(graph, nodeId, portId)[0];
  return v == null ? "" : String(v);
}

/** Human label for a source node's output port. */
function sourceLabel(node: FlowNode, portId: string): string {
  switch (node.type) {
    case "request-inputs": {
      const f = (node.data as RequestInputsData).fields.find(
        (x) => x.id === portId
      );
      return f?.key ?? "input";
    }
    case "gemini":
      return (node.data as GeminiData).model;
    case "crop-image":
      return "crop_image";
    default:
      return node.type;
  }
}

const IMAGE_URL = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i;

export interface ConnectedSource {
  edgeId: string;
  label: string;
  value: unknown;
  kind: "image" | "text";
}

/** Every source wired into an input port, with its live value (for display). */
export function connectedSources(
  graph: WorkflowGraph,
  nodeId: string,
  portId: string
): ConnectedSource[] {
  const out: ConnectedSource[] = [];
  for (const e of graph.edges) {
    if (e.target !== nodeId || e.targetHandle !== `in:${portId}`) continue;
    const sh = parseHandle(e.sourceHandle);
    const src = graph.nodes.find((n) => n.id === e.source);
    if (!sh || !src) continue;
    const value = sourceOutputValue(src, sh.portId);
    const isImage =
      src.type === "crop-image" ||
      (src.type === "request-inputs" &&
        (src.data as RequestInputsData).fields.find((f) => f.id === sh.portId)
          ?.fieldType === "image_field") ||
      (typeof value === "string" && IMAGE_URL.test(value));
    out.push({
      edgeId: e.id,
      label: sourceLabel(src, sh.portId),
      value,
      kind: isImage ? "image" : "text",
    });
  }
  return out;
}

/** Local (non-executable) node outputs, computed without Trigger.dev. */
export function computeLocalOutputs(
  node: FlowNode
): Record<string, unknown> | null {
  if (node.type === "request-inputs") {
    const data = node.data as RequestInputsData;
    const out: Record<string, unknown> = {};
    for (const f of data.fields) out[f.id] = f.value;
    return out;
  }
  return null;
}

/** Manual fallback values per node type, keyed by input port id. */
function manualValues(node: FlowNode): Record<string, unknown> {
  switch (node.type) {
    case "crop-image": {
      const v = (node.data as CropImageData).values;
      return {
        inputImage: v.inputImage,
        x: v.x,
        y: v.y,
        width: v.width,
        height: v.height,
      };
    }
    case "gemini": {
      const v = (node.data as GeminiData).values;
      const out: Record<string, unknown> = {
        prompt: v.prompt,
        systemPrompt: v.systemPrompt,
      };
      if (v.image) out.image = v.image;
      if (v.video) out.video = v.video;
      if (v.audio) out.audio = v.audio;
      if (v.file) out.file = v.file;
      return out;
    }
    default:
      return {};
  }
}

/** Is a specific input handle currently fed by an edge? */
export function isInputConnected(
  graph: WorkflowGraph,
  nodeId: string,
  portId: string
): boolean {
  return graph.edges.some(
    (e) => e.target === nodeId && e.targetHandle === `in:${portId}`
  );
}

/**
 * Resolve all input port values for a node. `multi` ports return an array.
 * Connected values come from `outputs[sourceNode][sourcePort]`.
 */
export function resolveNodeInputs(
  graph: WorkflowGraph,
  node: FlowNode,
  outputs: OutputsByNode
): Record<string, unknown> {
  const { inputs } = getPorts(node);
  const manual = manualValues(node);
  const resolved: Record<string, unknown> = {};

  for (const port of inputs) {
    const edges = graph.edges.filter(
      (e) => e.target === node.id && e.targetHandle === `in:${port.id}`
    );

    if (edges.length === 0) {
      if (port.id in manual) resolved[port.id] = manual[port.id];
      continue;
    }

    const values = edges
      .map((e) => {
        const sh = parseHandle(e.sourceHandle);
        if (!sh) return undefined;
        return outputs[e.source]?.[sh.portId];
      })
      .filter((v) => v !== undefined && v !== null && v !== "");

    resolved[port.id] = port.multi ? values : values[0];
  }

  return resolved;
}
