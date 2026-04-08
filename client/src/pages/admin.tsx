import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, UserPlus, Mail, Trash2, Users } from "lucide-react";

export default function AdminPage() {
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState("");

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/auth/me"],
    queryFn: () => fetch("/auth/me").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users").then(r => r.json()),
  });

  const { data: invitedEmails = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/invited-emails"],
    queryFn: () => apiRequest("GET", "/api/admin/invited-emails").then(r => r.json()),
  });

  const inviteMutation = useMutation({
    mutationFn: (email: string) => apiRequest("POST", "/api/admin/invited-emails", { email }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invited-emails"] });
      setInviteEmail("");
      toast({ title: "Email invited" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const removeInviteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/invited-emails/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invited-emails"] });
      toast({ title: "Invite removed" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      apiRequest("PATCH", `/api/users/${userId}/role`, { role }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Role updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (currentUser?.role !== "admin" && currentUser?.authRequired !== false) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border/50 shrink-0">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Admin Settings
        </h1>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 max-w-3xl mx-auto space-y-6">

          {/* Invite Users */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Invite External Users
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Users with <span className="font-medium">@averoadvisors.com</span> emails can sign in automatically.
                Invite external users by adding their email below.
              </p>

              <div className="flex gap-2">
                <Input
                  className="flex-1 h-8 text-xs"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && inviteEmail.trim() && inviteMutation.mutate(inviteEmail.trim())}
                />
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  disabled={!inviteEmail.trim() || inviteMutation.isPending}
                  onClick={() => inviteMutation.mutate(inviteEmail.trim())}
                >
                  <Mail className="w-3 h-3" />Invite
                </Button>
              </div>

              {invitedEmails.length > 0 && (
                <div className="space-y-1">
                  {invitedEmails.map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-xs">
                      <span>{inv.email}</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeInviteMutation.mutate(inv.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Registered Users */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4" />
                Registered Users ({users.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {users.map((user: any) => (
                  <div key={user.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20">
                    {user.picture ? (
                      <img src={user.picture} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {user.name?.[0]?.toUpperCase() || "?"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    {user.id === currentUser?.id ? (
                      <Badge className="text-[10px]">You</Badge>
                    ) : (
                      <Select value={user.role} onValueChange={(role) => updateRoleMutation.mutate({ userId: user.id, role })}>
                        <SelectTrigger className="w-24 h-7 text-[10px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin" className="text-xs">Admin</SelectItem>
                          <SelectItem value="editor" className="text-xs">Editor</SelectItem>
                          <SelectItem value="viewer" className="text-xs">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>
      </ScrollArea>
    </div>
  );
}
