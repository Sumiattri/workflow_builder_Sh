// ─────────────────────────────────────────────────────────────
// System workflows: read-only prebuilt templates shown to every user.
// Opening one creates a personal copy in the user's account.
// ─────────────────────────────────────────────────────────────
import { type WorkflowGraph } from "./types";
import { DEFAULT_GEMINI_SETTINGS } from "./node-defs";

export interface SystemWorkflow {
  id: string;
  name: string;
  description: string;
  gradient: string; // tailwind gradient classes for the card thumbnail
  graph: WorkflowGraph;
}

const PRODUCT_TEXT =
  "Product: Wireless Bluetooth Headphones. Features: Noise cancellation, 30-hour battery, foldable design.";

// pre-loaded product photo for the image_field (hosted on Transloadit R2)
const PRODUCT_IMAGE =
  "https://pub-e8fef8c0e03b44acb340577811800829.r2.dev/6c0162858a924519a25df29e24a64fb2/d697751741c6401ca40cf3bf09f5a07e/d2bed1ba35f74e3da416c1c3d729d4e1.webp";

function gemini(systemPrompt: string, response?: string) {
  return {
    model: "gemini-3.1-pro",
    values: { prompt: "", systemPrompt },
    settings: { ...DEFAULT_GEMINI_SETTINGS },
    settingsOpen: false,
    ...(response ? { response } : {}),
  };
}

// example outputs so the template shows a finished result on open
const EX_DESCRIPTION =
  "Meet the next evolution in personal audio. These Wireless Bluetooth Headphones pair best-in-class active noise cancellation with rich, immersive sound, so every track, call, and podcast comes through crystal clear. A marathon 30-hour battery keeps you going from your morning commute to late-night focus sessions, and the foldable design slips effortlessly into any bag. Premium sound, all-day comfort, zero compromise.";
const EX_HOOK =
  "🎧 Silence the world, not your vibe. Studio-grade noise cancellation, a 30-hour battery, and a foldable design that goes everywhere. Your soundtrack, uninterrupted. #Audio #NoiseCancelling";
const EX_FINAL =
  "Introducing our Wireless Bluetooth Headphones — premium sound meets all-day freedom. 🎧 Active noise cancellation tunes out the chaos, a 30-hour battery outlasts your longest days, and the foldable design goes wherever you do. Hear what matters. 🔊✨ #Headphones #NoiseCancelling #OnTheGo";

const trialTaskGraph: WorkflowGraph = {
  nodes: [
    {
      id: "request-inputs_main",
      type: "request-inputs",
      position: { x: 0, y: 580 },
      deletable: false,
      data: {
        fields: [
          {
            id: "f_text",
            key: "text_field",
            label: "text_field",
            fieldType: "text_field",
            value: PRODUCT_TEXT,
          },
          {
            id: "f_img",
            key: "image_field",
            label: "image_field",
            fieldType: "image_field",
            value: PRODUCT_IMAGE,
          },
        ],
      },
    },
    {
      id: "gemini_1",
      type: "gemini",
      position: { x: 520, y: 0 },
      data: gemini(
        "You are a marketing copywriter. Write a one-paragraph product description.",
        EX_DESCRIPTION
      ),
    },
    {
      id: "crop_1",
      type: "crop-image",
      position: { x: 520, y: 1000 },
      data: {
        values: { inputImage: "", x: 20, y: 20, width: 60, height: 60 },
        output: PRODUCT_IMAGE,
      },
    },
    {
      id: "crop_2",
      type: "crop-image",
      position: { x: 520, y: 1980 },
      data: {
        values: { inputImage: "", x: 0, y: 0, width: 100, height: 50 },
        output: PRODUCT_IMAGE,
      },
    },
    {
      id: "gemini_2",
      type: "gemini",
      position: { x: 1100, y: 140 },
      data: gemini(
        "Condense the following product description into a tweet-length hook (under 240 characters).",
        EX_HOOK
      ),
    },
    {
      id: "gemini_3",
      type: "gemini",
      position: { x: 1700, y: 680 },
      data: gemini(
        "You are a social media manager. Combine the tweet hook and the two product crops into a final marketing post.",
        EX_FINAL
      ),
    },
    {
      id: "response_main",
      type: "response",
      position: { x: 2480, y: 1120 },
      deletable: false,
      data: {},
    },
  ],
  edges: [
    edge("e_text_g1", "request-inputs_main", "out:f_text", "gemini_1", "in:prompt"),
    edge("e_img_c1", "request-inputs_main", "out:f_img", "crop_1", "in:inputImage"),
    edge("e_img_c2", "request-inputs_main", "out:f_img", "crop_2", "in:inputImage"),
    edge("e_g1_g2", "gemini_1", "out:response", "gemini_2", "in:prompt"),
    edge("e_g2_g3", "gemini_2", "out:response", "gemini_3", "in:prompt"),
    edge("e_c1_g3", "crop_1", "out:output", "gemini_3", "in:image"),
    edge("e_c2_g3", "crop_2", "out:output", "gemini_3", "in:image"),
    edge("e_g3_resp", "gemini_3", "out:response", "response_main", "in:result"),
    edge("e_c2_resp", "crop_2", "out:output", "response_main", "in:result"),
  ],
};

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string
) {
  return { id, source, sourceHandle, target, targetHandle };
}

export const SYSTEM_WORKFLOWS: SystemWorkflow[] = [
  {
    id: "trial-task",
    name: "Trial Task Workflow",
    description: "Product marketing post from a description + image.",
    gradient: "from-indigo-500 via-violet-500 to-fuchsia-500",
    graph: trialTaskGraph,
  },
];

export function getSystemWorkflow(id: string): SystemWorkflow | undefined {
  return SYSTEM_WORKFLOWS.find((w) => w.id === id);
}

/** Strip baked-in example outputs so a cloned copy starts clean (ready to run). */
export function cleanTemplateGraph(graph: WorkflowGraph): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (n.type === "gemini" || n.type === "crop-image") {
        const data = { ...(n.data as Record<string, unknown>) };
        delete data.response;
        delete data.output;
        return { ...n, data: data as typeof n.data };
      }
      return n;
    }),
  };
}
