import { SidebarTrigger } from "@/components/ui/sidebar";

export function AppHeader() {
  return (
    <header className="flex items-center h-12 px-3 border-b bg-background/80 backdrop-blur-sm shrink-0">
      <SidebarTrigger data-testid="button-sidebar-toggle" />
    </header>
  );
}
