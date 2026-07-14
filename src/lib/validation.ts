import { z } from "zod";

// ── Graph ────────────────────────────────────────────────────
export const nodeTypeSchema = z.enum([
  "request-inputs",
  "crop-image",
  "gemini",
  "response",
  "sticky-note",
]);

export const flowNodeSchema = z.object({
  id: z.string(),
  type: nodeTypeSchema,
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()),
  deletable: z.boolean().optional(),
});

export const flowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceHandle: z.string(),
  target: z.string(),
  targetHandle: z.string(),
});

export const workflowGraphSchema = z.object({
  nodes: z.array(flowNodeSchema),
  edges: z.array(flowEdgeSchema),
  viewport: z
    .object({ x: z.number(), y: z.number(), zoom: z.number() })
    .optional(),
});

// ── API payloads ─────────────────────────────────────────────
export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  graph: workflowGraphSchema.optional(),
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  graph: workflowGraphSchema.optional(),
});

export const runScopeSchema = z.enum(["FULL", "PARTIAL", "SINGLE"]);

export const executeSchema = z.object({
  scope: runScopeSchema,
  /** node ids targeted by this run; for FULL this is all executable nodes */
  targetNodeIds: z.array(z.string()).min(1),
});

export const transloaditSignatureSchema = z.object({
  // optional: client may request params for a specific upload
  filename: z.string().optional(),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type ExecuteInput = z.infer<typeof executeSchema>;
