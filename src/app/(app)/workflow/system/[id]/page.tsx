import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getSystemWorkflow } from "@/lib/system-workflows";
import { type WorkflowDTO } from "@/lib/types";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";

export const dynamic = "force-dynamic";

export default async function SystemWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) notFound();
  const { id } = await params;

  const template = getSystemWorkflow(id);
  if (!template) notFound();

  const now = new Date().toISOString();
  const workflow: WorkflowDTO = {
    id: `system:${template.id}`,
    name: template.name,
    graph: template.graph,
    createdAt: now,
    updatedAt: now,
  };

  return <WorkflowCanvas workflow={workflow} readOnly />;
}
