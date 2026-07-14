import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { type WorkflowDTO, type WorkflowGraph } from "@/lib/types";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";

export const dynamic = "force-dynamic";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) notFound();
  const { id } = await params;

  const wf = await prisma.workflow.findFirst({ where: { id, userId } });
  if (!wf) notFound();

  const workflow: WorkflowDTO = {
    id: wf.id,
    name: wf.name,
    graph: wf.graph as unknown as WorkflowGraph,
    createdAt: wf.createdAt.toISOString(),
    updatedAt: wf.updatedAt.toISOString(),
  };

  return <WorkflowCanvas workflow={workflow} />;
}
