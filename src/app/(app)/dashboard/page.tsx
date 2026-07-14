import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Dashboard from "@/components/dashboard/Dashboard";
import type { WorkflowListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  let items: WorkflowListItem[] = [];
  let loadError: string | undefined;

  try {
    const workflows = await prisma.workflow.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { runs: { where: { status: "RUNNING" } } },
        },
      },
    });

    items = workflows.map((w) => ({
      id: w.id,
      name: w.name,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
      hasActiveRun: w._count.runs > 0,
    }));
  } catch {
    loadError =
      "Couldn't reach the database. Set a valid DATABASE_URL in .env and run `npm run db:push`.";
  }

  return (
    <main className="h-full overflow-y-auto scrollbar-thin">
      <Dashboard workflows={items} loadError={loadError} />
    </main>
  );
}
