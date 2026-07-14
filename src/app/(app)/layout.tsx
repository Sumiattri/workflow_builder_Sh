import { Sidebar } from "@/components/Sidebar";
import { cookies } from "next/headers";

// Shared shell for the dashboard + workflow canvas. The Sidebar lives here so
// it persists (and keeps its collapsed state) across navigation between pages.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const initialCollapsed =
    cookieStore.get("nf-sidebar-collapsed")?.value === "1";

  return (
    <div className="flex h-screen overflow-hidden">
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var c=localStorage.getItem("nf-sidebar-collapsed")==="1"||document.cookie.indexOf("nf-sidebar-collapsed=1")!==-1;document.documentElement.style.setProperty("--nf-sidebar-width",c?"60px":"16rem")}catch(e){}`,
        }}
      />
      <Sidebar initialCollapsed={initialCollapsed} />
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
