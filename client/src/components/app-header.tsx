import { useQuery } from "@tanstack/react-query";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function AppHeader() {
  const { data: user } = useQuery({
    queryKey: ["/auth/me"],
    queryFn: () => fetch("/auth/me").then(r => r.json()),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <header className="flex items-center h-12 px-4 border-b border-border/60 bg-background/60 backdrop-blur-md shrink-0">
      <SidebarTrigger data-testid="button-sidebar-toggle" />
      <div className="flex-1" />
      {user && (
        <div className="flex items-center gap-2">
          {user.picture && (
            <img src={user.picture} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
          )}
          <span className="text-sm text-muted-foreground hidden sm:inline">{user.name}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => {
              fetch("/auth/logout", { method: "POST" }).then(() => window.location.reload());
            }}
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </header>
  );
}
