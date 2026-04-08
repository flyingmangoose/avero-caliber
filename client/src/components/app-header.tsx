import { SidebarTrigger } from "@/components/ui/sidebar";

export function AppHeader() {
  return (
    <header className="flex items-center h-11 px-3 border-b border-border/60 bg-background/60 backdrop-blur-md shrink-0">
      <SidebarTrigger data-testid="button-sidebar-toggle" />
    </header>
  );
}
