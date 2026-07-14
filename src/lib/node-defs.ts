// ─────────────────────────────────────────────────────────────
// Node catalog: ports, defaults, and the + picker definition.
// ─────────────────────────────────────────────────────────────
import { nanoid } from "nanoid";
import {
  type CropImageData,
  type FlowNode,
  type GeminiData,
  type GeminiSettings,
  type NodeData,
  type NodeType,
  type Port,
  type RequestField,
  type RequestInputsData,
  type ResponseData,
  type StickyNoteData,
} from "./types";

export const GEMINI_MODELS = [
  "gemini-3.1-pro",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
] as const;

export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0];

export const DEFAULT_GEMINI_SETTINGS: GeminiSettings = {
  temperature: 0.7,
  maxOutputTokens: 1024,
  topP: 1,
  topK: 0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  seed: 0,
};

/** Executable nodes run as Trigger.dev tasks; the rest resolve locally. */
export function isExecutable(type: NodeType): boolean {
  return type === "crop-image" || type === "gemini";
}

export const PICKER_CATEGORIES = ["Utility", "LLM"] as const;
export type PickerCategory = (typeof PICKER_CATEGORIES)[number];

export interface PickerItem {
  type: NodeType;
  label: string;
  description: string;
  category: PickerCategory;
  /** functional in this trial */
  enabled: boolean;
}

/** Items available from the bottom-center + picker. */
export const PICKER_ITEMS: PickerItem[] = [
  {
    type: "crop-image",
    label: "Crop Image",
    description: "Crop an image by X / Y / Width / Height (%).",
    category: "Utility",
    enabled: true,
  },
  {
    type: "gemini",
    label: "Gemini 3.1 Pro",
    description: "Run a Google Gemini prompt with multimodal vision.",
    category: "LLM",
    enabled: true,
  },
];

// ── Default data factories ───────────────────────────────────

export function makeRequestField(
  fieldType: RequestField["fieldType"],
  index: number
): RequestField {
  const base = fieldType;
  const key = index === 0 ? base : `${base}_${index + 1}`;
  return {
    id: nanoid(8),
    key,
    label: key,
    fieldType,
    value: "",
  };
}

export function defaultData(type: NodeType): NodeData {
  switch (type) {
    case "request-inputs":
      return {
        fields: [makeRequestField("text_field", 0)],
      } satisfies RequestInputsData;
    case "crop-image":
      return {
        values: { inputImage: "", x: 0, y: 0, width: 100, height: 100 },
      } satisfies CropImageData;
    case "gemini":
      return {
        model: DEFAULT_GEMINI_MODEL,
        values: { prompt: "", systemPrompt: "" },
        settings: { ...DEFAULT_GEMINI_SETTINGS },
        settingsOpen: false,
      } satisfies GeminiData;
    case "response":
      return {} satisfies ResponseData;
    case "sticky-note":
      return {
        text: "",
        color: "yellow",
        bold: false,
        fontSize: 16,
        fontFamily: "sans",
      } satisfies StickyNoteData;
  }
}

// ── Port resolution (Request-Inputs ports are dynamic) ───────

export function getPorts(node: Pick<FlowNode, "type" | "data">): {
  inputs: Port[];
  outputs: Port[];
} {
  switch (node.type) {
    case "request-inputs": {
      const data = node.data as RequestInputsData;
      return {
        inputs: [],
        outputs: data.fields.map((f) => ({
          id: f.id,
          label: f.key,
          type:
            f.fieldType === "image_field"
              ? "image"
              : f.fieldType === "number_field"
                ? "number"
                : "text",
        })),
      };
    }
    case "crop-image":
      return {
        inputs: [
          { id: "inputImage", label: "Input Image", type: "image", required: true },
          { id: "x", label: "X Position (%)", type: "number" },
          { id: "y", label: "Y Position (%)", type: "number" },
          { id: "width", label: "Width (%)", type: "number" },
          { id: "height", label: "Height (%)", type: "number" },
        ],
        outputs: [{ id: "output", label: "Output Image", type: "image" }],
      };
    case "gemini":
      return {
        inputs: [
          { id: "prompt", label: "Prompt", type: "text", required: true },
          { id: "systemPrompt", label: "System Prompt", type: "text" },
          { id: "image", label: "Image (Vision)", type: "image", multi: true },
          { id: "video", label: "Video", type: "video" },
          { id: "audio", label: "Audio", type: "audio" },
          { id: "file", label: "File", type: "file" },
        ],
        outputs: [{ id: "response", label: "Response", type: "text" }],
      };
    case "response":
      return {
        inputs: [{ id: "result", label: "result", type: "any", multi: true }],
        outputs: [],
      };
    case "sticky-note":
      return { inputs: [], outputs: [] };
  }
}

export function getPort(
  node: Pick<FlowNode, "type" | "data">,
  dir: "in" | "out",
  portId: string
): Port | undefined {
  const { inputs, outputs } = getPorts(node);
  return (dir === "in" ? inputs : outputs).find((p) => p.id === portId);
}

export const NODE_TITLES: Record<NodeType, string> = {
  "request-inputs": "Request-Inputs",
  "crop-image": "Crop Image",
  gemini: "Gemini 3.1 Pro",
  response: "Response",
  "sticky-note": "Sticky Note",
};
