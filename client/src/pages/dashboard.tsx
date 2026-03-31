import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  FileText,
  BarChart3,
  Layers,
  AlertTriangle,
  Trash2,
  FolderOpen,
} from "lucide-react";

interface ProjectWithStats extends Project {
  stats: {
    totalRequirements: number;
    criticalCount: number;
    desiredCount: number;
    moduleCoverage: number;
    responseStats: Record<string, number>;
  };
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    active: "bg-primary/10 text-primary dark:bg-accent/20 dark:text-accent",
    finalized: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  };
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wide ${map[status] || ""}`}>
      {status}
    </Badge>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: projects, isLoading } = useQuery<ProjectWithStats[]>({
    queryKey: ["/api/projects"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/projects", {
        name: newName,
        description: newDesc,
        status: "draft",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setDialogOpen(false);
      setNewName("");
      setNewDesc("");
      toast({ title: "Project created", description: "Your new project is ready." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project deleted" });
    },
  });

  // Aggregate stats
  const totalReqs = projects?.reduce((s, p) => s + p.stats.totalRequirements, 0) ?? 0;
  const totalCritical = projects?.reduce((s, p) => s + p.stats.criticalCount, 0) ?? 0;
  const totalModules = projects?.reduce((s, p) => s + p.stats.moduleCoverage, 0) ?? 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="page-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage ERP requirements across client engagements
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-project" className="gap-1.5">
              <Plus className="w-4 h-4" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Project Name</label>
                <Input
                  placeholder="e.g., City of Springfield ERP Modernization"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  data-testid="input-project-name"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Description</label>
                <Textarea
                  placeholder="Brief description of the engagement scope..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                  data-testid="input-project-description"
                />
              </div>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!newName.trim() || createMutation.isPending}
                className="w-full"
                data-testid="button-submit-project"
              >
                {createMutation.isPending ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 dark:bg-accent/15">
              <FileText className="w-5 h-5 text-primary dark:text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalReqs}</p>
              <p className="text-xs text-muted-foreground">Total Requirements</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/15">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalReqs > 0 ? Math.round((totalCritical / totalReqs) * 100) : 0}%</p>
              <p className="text-xs text-muted-foreground">Critical Requirements</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/15">
              <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalModules}</p>
              <p className="text-xs text-muted-foreground">Modules Covered</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="space-y-3">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow" data-testid={`card-project-${project.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <Link href={`/projects/${project.id}`} className="flex-1 min-w-0 no-underline group">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold truncate group-hover:text-primary dark:group-hover:text-accent transition-colors">
                        {project.name}
                      </h3>
                      {statusBadge(project.status)}
                    </div>
                    {project.description && (
                      <p className="text-xs text-muted-foreground truncate mb-3">{project.description}</p>
                    )}
                    <div className="flex items-center gap-5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" />
                        {project.stats.totalRequirements} requirements
                      </span>
                      <span className="flex items-center gap-1">
                        <BarChart3 className="w-3.5 h-3.5" />
                        {project.stats.criticalCount} critical
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5" />
                        {project.stats.moduleCoverage} modules
                      </span>
                    </div>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive shrink-0 ml-2"
                    onClick={() => {
                      if (confirm("Delete this project and all its requirements?")) {
                        deleteMutation.mutate(project.id);
                      }
                    }}
                    data-testid={`button-delete-project-${project.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-semibold mb-1">No projects yet</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Create your first project to start defining ERP requirements.
            </p>
            <Button onClick={() => setDialogOpen(true)} variant="outline" size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Create Project
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
