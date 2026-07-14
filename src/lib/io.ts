"use client";
import { type WorkflowGraph } from "./types";
import { workflowGraphSchema } from "./validation";

export interface WorkflowExport {
  name: string;
  graph: WorkflowGraph;
  exportedAt: string;
  version: 1;
}

export function exportWorkflow(name: string, graph: WorkflowGraph) {
  const payload: WorkflowExport = {
    name,
    graph,
    exportedAt: new Date().toISOString(),
    version: 1,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.nextflow.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importWorkflowFile(
  file: File
): Promise<{ name: string; graph: WorkflowGraph }> {
  const text = await file.text();
  const json = JSON.parse(text);
  const graph = workflowGraphSchema.parse(json.graph ?? json);
  const name = typeof json.name === "string" ? json.name : "Imported Workflow";
  return { name, graph: graph as WorkflowGraph };
}
