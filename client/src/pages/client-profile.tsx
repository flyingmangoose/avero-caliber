import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Building2, RefreshCw, Upload, Plus, ExternalLink, Pencil, Check, X, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

type Profile = {
  id: number; projectId: number; entityType: string | null; entityName: string | null;
  state: string | null; population: number | null; employeeCount: number | null;
  annualBudget: string | null; currentSystems: string | null; departments: string | null;
  painSummary: string | null; domain: string | null; leadership: string | null;
  documents: string | null; createdAt: string;
};

function parseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

export default function ClientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [location] = useLocation();
  const isClientRoute = location.includes('/clients/');
  const projectId = parseInt(id!);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: clientData } = useQuery<any>({
    queryKey: ["/api/clients", projectId],
    queryFn: () => apiRequest("GET", `/api/clients/${projectId}`).then(r => r.json()),
    enabled: isClientRoute,
  });
  const { data: orgProfile, isLoading } = useQuery<Profile>({
    queryKey: ["/api/projects", projectId, "org-profile"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/org-profile`).then(r => r.json()),
    enabled: !isClientRoute,
  });
  const profile: Profile | undefined = isClientRoute && clientData ? {
    id: clientData.id, projectId: 0, entityType: clientData.entityType, entityName: clientData.name,
    state: clientData.state, population: clientData.population, employeeCount: clientData.employeeCount,
    annualBudget: clientData.annualBudget, currentSystems: clientData.currentSystems,
    departments: clientData.departments, painSummary: clientData.painSummary,
    domain: clientData.domain, leadership: clientData.leadership,
    documents: clientData.documents, createdAt: clientData.createdAt,
  } : orgProfile;
  const { data: project } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}`).then(r => r.json()),
  });
  const { data: interviews } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "interviews"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/discovery/interviews`).then(r => r.json()),
  });
  const { data: painPoints } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "pain-points"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/discovery/pain-points`).then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => {
      if (isClientRoute) {
        // Map org-profile field names to client table field names
        const mapped: any = { ...data };
        if ('entityName' in mapped) { mapped.name = mapped.entityName; delete mapped.entityName; }
        return apiRequest("PATCH", `/api/clients/${projectId}`, mapped).then(r => r.json());
      }
      return apiRequest("POST", `/api/projects/${projectId}/org-profile`, data).then(r => r.json());
    },
    onSuccess: () => {
      if (isClientRoute) {
        qc.invalidateQueries({ queryKey: ["/api/clients", projectId] });
        qc.invalidateQueries({ queryKey: ["/api/clients"] });
      } else {
        qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "org-profile"] });
      }
    },
  });

  // Re-enrich dialog
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [enrichDomain, setEnrichDomain] = useState("");
  const enrichMutation = useMutation({
    mutationFn: async (domain: string) => {
      if (isClientRoute) {
        const res = await apiRequest("POST", `/api/clients/${projectId}/enrich`, { domain });
        return res.json();
      }
      const res = await apiRequest("POST", "/api/research-domain", { domain });
      return res.json();
    },
    onSuccess: (result) => {
      if (!result.success) { toast({ title: "Enrichment failed", variant: "destructive" }); return; }
      if (isClientRoute) {
        qc.invalidateQueries({ queryKey: ["/api/clients", projectId] });
        qc.invalidateQueries({ queryKey: ["/api/clients"] });
        toast({ title: "Client profile enriched" });
        setEnrichOpen(false);
        return;
      }
      const d = result.data;
      const current = profile || {} as any;
      let updatedCount = 0;
      const merged: any = {};
      const fillIfEmpty = (key: string, val: any) => {
        if (val != null && val !== "" && (current[key] == null || current[key] === "")) {
          merged[key] = val; updatedCount++;
        }
      };
      fillIfEmpty("entityName", d.entityName);
      fillIfEmpty("entityType", d.entityType);
      fillIfEmpty("state", d.state);
      fillIfEmpty("population", d.population);
      fillIfEmpty("employeeCount", d.employeeCount);
      fillIfEmpty("annualBudget", d.annualBudget);
      fillIfEmpty("painSummary", d.painSummary);
      if (d.departments?.length && !parseJSON(current.departments, []).length) {
        merged.departments = d.departments; updatedCount++;
      }
      if (d.currentSystems?.length && !parseJSON(current.currentSystems, []).length) {
        merged.currentSystems = d.currentSystems; updatedCount++;
      }
      if (d.leadership?.length && !parseJSON(current.leadership, []).length) {
        merged.leadership = d.leadership; updatedCount++;
      }
      merged.domain = enrichDomain;
      saveMutation.mutate(merged);
      setEnrichOpen(false);
      toast({ title: `Updated ${updatedCount} field${updatedCount !== 1 ? "s" : ""} from website` });
    },
    onError: () => toast({ title: "Enrichment failed", variant: "destructive" }),
  });

  // Upload document
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (isClientRoute) {
        // For client route: read file text and send to extract-document-text endpoint
        const text = await file.text();
        const res = await apiRequest("POST", `/api/clients/${projectId}/extract-document`, {
          fileName: file.name,
          documentText: text.substring(0, 30000),
        });
        return res.json();
      }
      // For project route: use FormData upload
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/api/extract-document`, { method: "POST", body: fd });
      return res.json();
    },
    onSuccess: (result) => {
      if (!result.success) { toast({ title: "Extraction failed", variant: "destructive" }); return; }
      if (isClientRoute) {
        // Backend already merged data and saved to client — just refresh
        qc.invalidateQueries({ queryKey: ["/api/clients", projectId] });
        qc.invalidateQueries({ queryKey: ["/api/clients"] });
        toast({ title: "Document processed", description: `Extracted ${result.extractedFields || 0} fields` });
        return;
      }
      const d = result.data;
      const current = profile || {} as any;
      const merged: any = {};
      if (d.entityName && !current.entityName) merged.entityName = d.entityName;
      if (d.entityType && !current.entityType) merged.entityType = d.entityType;
      if (d.state && !current.state) merged.state = d.state;
      if (d.annualBudget && !current.annualBudget) merged.annualBudget = d.annualBudget;
      const docs = parseJSON<any[]>(current.documents, []);
      docs.push({ filename: (fileRef.current?.files?.[0]?.name) || "document", uploadedAt: new Date().toISOString(), extractedFields: Object.keys(d).filter(k => d[k]) });
      merged.documents = docs;
      saveMutation.mutate(merged);
      toast({ title: "Document processed and merged" });
    },
    onError: () => toast({ title: "Upload failed", variant: "destructive" }),
  });

  // Inline editing helpers
  const save = (patch: any) => saveMutation.mutate(patch);

  const departments: any[] = parseJSON(profile?.departments, []);
  const systems: any[] = parseJSON(profile?.currentSystems, []);
  const leadership: any[] = parseJSON(profile?.leadership, []);
  const documents: any[] = parseJSON(profile?.documents, []);
  const completedInterviews = (interviews || []).filter((i: any) => i.status === "completed").length;
  const painPointCount = (painPoints || []).length;

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading profile...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="client-profile-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-7 h-7 text-[#d4a853]" />
          <h1 className="text-2xl font-bold">Client Profile</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" data-testid="btn-re-enrich" onClick={() => { setEnrichDomain(profile?.domain || ""); setEnrichOpen(true); }}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Re-Enrich from Website
          </Button>
          <Button variant="outline" size="sm" data-testid="btn-upload-doc" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1.5" /> Upload New Document
          </Button>
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f); e.target.value = ""; }} />
        </div>
      </div>

      {/* At a Glance */}
      <Card data-testid="section-at-a-glance">
        <CardHeader><CardTitle className="text-lg">At a Glance</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <EditableField label="Entity Name" value={profile?.entityName || ""} onSave={v => save({ entityName: v })} large />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Type:</span>
                <EditableField value={profile?.entityType || ""} onSave={v => save({ entityType: v })} badge />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">State:</span>
                <EditableField value={profile?.state || ""} onSave={v => save({ state: v })} />
              </div>
              {profile?.domain && (
                <a href={`https://${profile.domain}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline flex items-center gap-1" data-testid="domain-link">
                  {profile.domain} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Population:</span>
                <EditableField value={profile?.population != null ? String(profile.population) : ""} onSave={v => save({ population: v ? parseInt(v.replace(/,/g, "")) : null })} format="number" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Employees:</span>
                <EditableField value={profile?.employeeCount != null ? String(profile.employeeCount) : ""} onSave={v => save({ employeeCount: v ? parseInt(v.replace(/,/g, "")) : null })} format="number" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Annual Budget:</span>
                <EditableField value={profile?.annualBudget || ""} onSave={v => save({ annualBudget: v })} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Mode:</span>
                <Badge className="bg-[#d4a853]/20 text-[#d4a853] border-[#d4a853]/30">{project?.engagementMode === "self_service" ? "Self-Service" : "Consulting"}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status:</span>
                <Badge variant="outline">{project?.status || "draft"}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">Created: {project?.createdAt ? new Date(project.createdAt).toLocaleDateString() : "—"}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Departments */}
      <Card data-testid="section-departments">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Departments</CardTitle>
          <Button size="sm" variant="outline" data-testid="btn-add-department" onClick={() => {
            const updated = [...departments, { name: "New Department", headcount: 0, keyProcesses: "" }];
            save({ departments: updated });
          }}><Plus className="w-3.5 h-3.5 mr-1" /> Add Department</Button>
        </CardHeader>
        <CardContent>
          {departments.length === 0 ? <p className="text-sm text-muted-foreground">No departments added yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 font-medium">Department</th><th className="pb-2 font-medium">Headcount</th><th className="pb-2 font-medium">Key Processes</th><th className="pb-2 w-10"></th></tr></thead>
              <tbody>
                {departments.map((dept: any, i: number) => (
                  <DepartmentRow key={i} dept={dept} onUpdate={updated => {
                    const copy = [...departments]; copy[i] = updated; save({ departments: copy });
                  }} onDelete={() => {
                    const copy = departments.filter((_, idx) => idx !== i); save({ departments: copy });
                  }} />
                ))}
              </tbody>
              <tfoot><tr className="border-t font-medium"><td className="pt-2">Total</td><td className="pt-2">{departments.reduce((s: number, d: any) => s + (d.headcount || 0), 0).toLocaleString()}</td><td colSpan={2}></td></tr></tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Current Systems */}
      <Card data-testid="section-systems">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Current Systems</CardTitle>
          <Button size="sm" variant="outline" data-testid="btn-add-system" onClick={() => {
            const updated = [...systems, { name: "New System", module: "", vendor: "", yearsInUse: "" }];
            save({ currentSystems: updated });
          }}><Plus className="w-3.5 h-3.5 mr-1" /> Add System</Button>
        </CardHeader>
        <CardContent>
          {systems.length === 0 ? <p className="text-sm text-muted-foreground">No systems recorded yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 font-medium">System</th><th className="pb-2 font-medium">Module / Purpose</th><th className="pb-2 font-medium">Vendor</th><th className="pb-2 font-medium">Years in Use</th><th className="pb-2 w-10"></th></tr></thead>
              <tbody>
                {systems.map((sys: any, i: number) => (
                  <SystemRow key={i} sys={sys} onUpdate={updated => {
                    const copy = [...systems]; copy[i] = updated; save({ currentSystems: copy });
                  }} onDelete={() => {
                    const copy = systems.filter((_, idx) => idx !== i); save({ currentSystems: copy });
                  }} />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Key Challenges */}
      <Card data-testid="section-challenges">
        <CardHeader><CardTitle className="text-lg">Key Challenges</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <EditableTextarea value={profile?.painSummary || ""} onSave={v => save({ painSummary: v })} placeholder="Describe the key pain points and challenges..." />
          {(completedInterviews > 0 || painPointCount > 0) && (
            <div className="bg-muted/50 rounded-lg p-3">
              <h4 className="text-sm font-medium mb-1">Discovery Insights</h4>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>{completedInterviews} interview{completedInterviews !== 1 ? "s" : ""} completed</span>
                <span>{painPointCount} pain point{painPointCount !== 1 ? "s" : ""} identified</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leadership */}
      <Card data-testid="section-leadership">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Leadership</CardTitle>
          <Button size="sm" variant="outline" data-testid="btn-add-leader" onClick={() => {
            const updated = [...leadership, { name: "", title: "" }];
            save({ leadership: updated });
          }}><Plus className="w-3.5 h-3.5 mr-1" /> Add</Button>
        </CardHeader>
        <CardContent>
          {leadership.length === 0 ? <p className="text-sm text-muted-foreground">No leadership data available.</p> : (
            <div className="space-y-2">
              {leadership.map((person: any, i: number) => (
                <LeadershipRow key={i} person={person} onUpdate={updated => {
                  const copy = [...leadership]; copy[i] = updated; save({ leadership: copy });
                }} onDelete={() => {
                  const copy = leadership.filter((_, idx) => idx !== i); save({ leadership: copy });
                }} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Project Documents */}
      <Card data-testid="section-documents">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Project Documents</CardTitle>
          <Button size="sm" variant="outline" data-testid="btn-upload-doc-section" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3.5 h-3.5 mr-1" /> Upload Document
          </Button>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? <p className="text-sm text-muted-foreground">No documents uploaded yet.</p> : (
            <div className="space-y-2">
              {documents.map((doc: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded border bg-muted/30" data-testid={`document-${i}`}>
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{doc.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      Uploaded {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : "—"}
                      {doc.extractedFields?.length > 0 && ` · Extracted: ${doc.extractedFields.join(", ")}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Re-Enrich Dialog */}
      <Dialog open={enrichOpen} onOpenChange={setEnrichOpen}>
        <DialogContent className="max-w-md" data-testid="re-enrich-dialog">
          <DialogHeader><DialogTitle>Re-Enrich from Website</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">Domain</label>
            <Input value={enrichDomain} onChange={e => setEnrichDomain(e.target.value)} placeholder="e.g. cityofexample.gov" data-testid="input-enrich-domain" />
            <p className="text-xs text-muted-foreground">New data will only fill in empty fields — existing values are preserved.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrichOpen(false)}>Cancel</Button>
            <Button onClick={() => enrichMutation.mutate(enrichDomain)} disabled={!enrichDomain.trim() || enrichMutation.isPending} data-testid="btn-fetch-merge">
              {enrichMutation.isPending ? <><RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> Fetching...</> : "Fetch & Merge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== Inline edit components ====================

function EditableField({ label, value, onSave, large, badge, format }: { label?: string; value: string; onSave: (v: string) => void; large?: boolean; badge?: boolean; format?: "number" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const display = format === "number" && value ? Number(value.replace(/,/g, "")).toLocaleString() : value;

  if (!editing) {
    return (
      <span className={`inline-flex items-center gap-1 group cursor-pointer ${large ? "text-xl font-bold" : "text-sm"}`} onClick={() => { setDraft(value); setEditing(true); }} data-testid={label ? `field-${label.toLowerCase().replace(/\s/g, "-")}` : undefined}>
        {badge ? <Badge variant="secondary">{display || "—"}</Badge> : (display || <span className="text-muted-foreground italic">—</span>)}
        <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Input className="h-7 text-sm w-40" value={draft} onChange={e => setDraft(e.target.value)} autoFocus onKeyDown={e => { if (e.key === "Enter") { onSave(draft); setEditing(false); } if (e.key === "Escape") setEditing(false); }} />
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { onSave(draft); setEditing(false); }}><Check className="w-3.5 h-3.5" /></Button>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5" /></Button>
    </span>
  );
}

function EditableTextarea({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div className="group cursor-pointer p-2 rounded border border-transparent hover:border-border min-h-[60px]" onClick={() => { setDraft(value); setEditing(true); }} data-testid="field-pain-summary">
        <p className="text-sm whitespace-pre-wrap">{value || <span className="text-muted-foreground italic">{placeholder}</span>}</p>
        <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 mt-1" />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4} autoFocus />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { onSave(draft); setEditing(false); }}>Save</Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function DepartmentRow({ dept, onUpdate, onDelete }: { dept: any; onUpdate: (d: any) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState(dept);

  if (!editing) {
    return (
      <tr className="border-b cursor-pointer hover:bg-muted/30" onClick={() => { setD({...dept}); setEditing(true); }} data-testid="department-row">
        <td className="py-1.5">{dept.name}</td>
        <td className="py-1.5">{(dept.headcount || 0).toLocaleString()}</td>
        <td className="py-1.5 text-muted-foreground">{dept.keyProcesses || "—"}</td>
        <td className="py-1.5"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={e => { e.stopPropagation(); onDelete(); }}><X className="w-3.5 h-3.5" /></Button></td>
      </tr>
    );
  }
  return (
    <tr className="border-b bg-muted/20" data-testid="department-row-editing">
      <td className="py-1.5"><Input className="h-7 text-sm" value={d.name} onChange={e => setD({...d, name: e.target.value})} /></td>
      <td className="py-1.5"><Input className="h-7 text-sm w-24" type="number" value={d.headcount || ""} onChange={e => setD({...d, headcount: parseInt(e.target.value) || 0})} /></td>
      <td className="py-1.5"><Input className="h-7 text-sm" value={d.keyProcesses || ""} onChange={e => setD({...d, keyProcesses: e.target.value})} /></td>
      <td className="py-1.5 flex gap-1">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { onUpdate(d); setEditing(false); }}><Check className="w-3.5 h-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5" /></Button>
      </td>
    </tr>
  );
}

function SystemRow({ sys, onUpdate, onDelete }: { sys: any; onUpdate: (s: any) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [s, setS] = useState(sys);

  if (!editing) {
    return (
      <tr className="border-b cursor-pointer hover:bg-muted/30" onClick={() => { setS({...sys}); setEditing(true); }} data-testid="system-row">
        <td className="py-1.5">{sys.name}</td>
        <td className="py-1.5">{sys.module || "—"}</td>
        <td className="py-1.5">{sys.vendor || "—"}</td>
        <td className="py-1.5">{sys.yearsInUse || "—"}</td>
        <td className="py-1.5"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={e => { e.stopPropagation(); onDelete(); }}><X className="w-3.5 h-3.5" /></Button></td>
      </tr>
    );
  }
  return (
    <tr className="border-b bg-muted/20" data-testid="system-row-editing">
      <td className="py-1.5"><Input className="h-7 text-sm" value={s.name} onChange={e => setS({...s, name: e.target.value})} /></td>
      <td className="py-1.5"><Input className="h-7 text-sm" value={s.module || ""} onChange={e => setS({...s, module: e.target.value})} /></td>
      <td className="py-1.5"><Input className="h-7 text-sm" value={s.vendor || ""} onChange={e => setS({...s, vendor: e.target.value})} /></td>
      <td className="py-1.5"><Input className="h-7 text-sm w-20" value={s.yearsInUse || ""} onChange={e => setS({...s, yearsInUse: e.target.value})} /></td>
      <td className="py-1.5 flex gap-1">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { onUpdate(s); setEditing(false); }}><Check className="w-3.5 h-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5" /></Button>
      </td>
    </tr>
  );
}

function LeadershipRow({ person, onUpdate, onDelete }: { person: any; onUpdate: (p: any) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [p, setP] = useState(person);

  if (!editing) {
    return (
      <div className="flex items-center gap-3 p-2 rounded border bg-muted/30 cursor-pointer hover:bg-muted/50 group" onClick={() => { setP({...person}); setEditing(true); }} data-testid="leadership-row">
        <div className="flex-1">
          <span className="text-sm font-medium">{person.name || "—"}</span>
          {person.title && <span className="text-sm text-muted-foreground ml-2">— {person.title}</span>}
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={e => { e.stopPropagation(); onDelete(); }}><X className="w-3.5 h-3.5" /></Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 p-2 rounded border bg-muted/20" data-testid="leadership-row-editing">
      <Input className="h-7 text-sm flex-1" placeholder="Name" value={p.name} onChange={e => setP({...p, name: e.target.value})} />
      <Input className="h-7 text-sm flex-1" placeholder="Title" value={p.title} onChange={e => setP({...p, title: e.target.value})} />
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { onUpdate(p); setEditing(false); }}><Check className="w-3.5 h-3.5" /></Button>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5" /></Button>
    </div>
  );
}
