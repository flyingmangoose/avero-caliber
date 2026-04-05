import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BookOpen, Sparkles, ChevronDown, Search, Loader2 } from "lucide-react";

const PLATFORMS = [
  { value: "__all__", label: "All Platforms" },
  { value: "workday", label: "Workday" },
  { value: "oracle_cloud", label: "Oracle Cloud" },
  { value: "tyler", label: "Tyler" },
  { value: "maximo", label: "Maximo" },
  { value: "nv5", label: "NV5" },
  { value: "oracle_eam", label: "Oracle EAM" },
];

const PLATFORM_COLORS: Record<string, string> = {
  workday: "#F68D2E",
  oracle_cloud: "#C74634",
  tyler: "#1B365D",
  maximo: "#0530AD",
  nv5: "#2D8C3C",
  oracle_eam: "#C74634",
};

const PLATFORM_LABELS: Record<string, string> = {
  workday: "Workday", oracle_cloud: "Oracle Cloud", tyler: "Tyler",
  maximo: "Maximo", nv5: "NV5", oracle_eam: "Oracle EAM",
};

const AUTO_COLORS: Record<string, string> = {
  fully_automated: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  semi_automated: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  manual: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  configurable: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
};

const MATURITY_COLORS: Record<number, string> = {
  5: "text-emerald-500", 4: "text-green-500", 3: "text-amber-500", 2: "text-orange-500", 1: "text-red-500",
};

function MaturityDots({ rating }: { rating: number | null }) {
  const r = rating || 0;
  return (
    <span className="inline-flex gap-0.5 text-xs" data-testid="maturity-dots">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={i <= r ? (MATURITY_COLORS[r] || "text-primary") : "text-muted-foreground/30"}>●</span>
      ))}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform] || "#888";
  const label = PLATFORM_LABELS[platform] || platform;
  return <Badge className="text-[10px] text-white border-0" style={{ backgroundColor: color }}>{label}</Badge>;
}

function parseJsonSafe(val: any): string[] {
  if (!val) return [];
  try { return typeof val === "string" ? JSON.parse(val) : val; } catch { return []; }
}

export default function KnowledgeBasePage() {
  const { toast } = useToast();
  const [platform, setPlatform] = useState("__all__");
  const [module, setModule] = useState("__all__");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [compareModule, setCompareModule] = useState("");
  const [comparePlatforms, setComparePlatforms] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const queryParams = new URLSearchParams();
  if (platform && platform !== "__all__") queryParams.set("platform", platform);
  if (module && module !== "__all__") queryParams.set("module", module);
  if (debouncedSearch) queryParams.set("search", debouncedSearch);
  const qs = queryParams.toString();

  const { data: capabilities = [] } = useQuery<any[]>({
    queryKey: ["/api/knowledge-base/capabilities", qs],
    queryFn: () => apiRequest("GET", `/api/knowledge-base/capabilities${qs ? "?" + qs : ""}`).then(r => r.json()),
  });

  // Derive modules from data
  const allModules = [...new Set(capabilities.map((c: any) => c.module))].sort();

  // Compare query
  const selectedComparePlatforms = Object.entries(comparePlatforms).filter(([, v]) => v).map(([k]) => k);
  const { data: compareData = [] } = useQuery<any[]>({
    queryKey: ["/api/knowledge-base/compare", compareModule, selectedComparePlatforms.join(",")],
    queryFn: () => apiRequest("GET", `/api/knowledge-base/compare?module=${encodeURIComponent(compareModule)}&platforms=${selectedComparePlatforms.join(",")}`).then(r => r.json()),
    enabled: !!compareModule && selectedComparePlatforms.length > 0,
  });

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    try {
      const res = await apiRequest("POST", "/api/knowledge-base/seed");
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-base/capabilities"] });
      toast({ title: "Knowledge base seeded", description: data.message });
    } catch (err: any) {
      toast({ title: "Seed failed", description: err.message, variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  }, [toast]);

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#d4a853]" />Vendor Knowledge Base
          </h1>
          <div className="ml-auto">
            <Button className="bg-[#d4a853] hover:bg-[#c49843] text-white text-xs gap-1.5" onClick={handleSeed} disabled={seeding} data-testid="button-seed-kb">
              {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Seed from Proposals
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-border/30 flex items-center gap-3 shrink-0">
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-40 h-8 text-xs" data-testid="filter-platform"><SelectValue placeholder="All Platforms" /></SelectTrigger>
          <SelectContent>{PLATFORMS.map(p => <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={module} onValueChange={setModule}>
          <SelectTrigger className="w-48 h-8 text-xs" data-testid="filter-module"><SelectValue placeholder="All Modules" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All Modules</SelectItem>
            {allModules.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="h-8 text-xs pl-8" placeholder="Search capabilities..." value={searchInput}
            onChange={e => setSearchInput(e.target.value)} data-testid="input-search-kb" />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6">
          <Tabs defaultValue="capabilities" data-testid="kb-tabs">
            <TabsList className="mb-4">
              <TabsTrigger value="capabilities" data-testid="tab-capabilities">Capabilities</TabsTrigger>
              <TabsTrigger value="compare" data-testid="tab-compare">Compare</TabsTrigger>
            </TabsList>

            {/* Capabilities Tab */}
            <TabsContent value="capabilities">
              {capabilities.length === 0 ? (
                <div className="text-center py-16">
                  <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No vendor capabilities loaded yet.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Click "Seed from Proposals" to extract knowledge from vendor proposal data.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {capabilities.map((cap: any) => {
                    const isOpen = expanded.has(cap.id);
                    const diffs = parseJsonSafe(cap.differentiators);
                    const lims = parseJsonSafe(cap.limitations);
                    const bestFit = parseJsonSafe(cap.bestFitFor);
                    return (
                      <Collapsible key={cap.id} open={isOpen} onOpenChange={() => toggleExpand(cap.id)}>
                        <Card className="overflow-hidden" data-testid={`cap-card-${cap.id}`}>
                          <CardContent className="p-3">
                            <div className="flex items-start gap-2 mb-1.5">
                              <PlatformBadge platform={cap.vendorPlatform} />
                              <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-semibold truncate">{cap.module}</h4>
                                <p className="text-[10px] text-muted-foreground">{cap.processArea}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <MaturityDots rating={cap.maturityRating} />
                                {cap.automationLevel && (
                                  <Badge className={`text-[9px] px-1.5 py-0 ${AUTO_COLORS[cap.automationLevel] || "bg-muted text-muted-foreground"}`}>
                                    {cap.automationLevel.replace(/_/g, " ")}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {cap.workflowDescription && (
                              <p className="text-[11px] text-muted-foreground line-clamp-3 mb-2">{cap.workflowDescription}</p>
                            )}
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-5 text-[10px] text-muted-foreground p-0 gap-1" data-testid={`expand-cap-${cap.id}`}>
                                <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                {isOpen ? "Hide" : "View"} Details
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
                                {cap.workflowDescription && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Workflow</p>
                                    <p className="text-[11px] whitespace-pre-line">{cap.workflowDescription}</p>
                                  </div>
                                )}
                                {diffs.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">Differentiators</p>
                                    <ul className="space-y-0.5">{diffs.map((d: string, i: number) => (
                                      <li key={i} className="text-[11px] flex gap-1.5"><span className="text-emerald-500 shrink-0">+</span><span>{d}</span></li>
                                    ))}</ul>
                                  </div>
                                )}
                                {lims.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 mb-0.5">Limitations</p>
                                    <ul className="space-y-0.5">{lims.map((l: string, i: number) => (
                                      <li key={i} className="text-[11px] flex gap-1.5"><span className="text-red-500 shrink-0">-</span><span>{l}</span></li>
                                    ))}</ul>
                                  </div>
                                )}
                                {bestFit.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Best Fit For</p>
                                    <ul className="space-y-0.5">{bestFit.map((b: string, i: number) => (
                                      <li key={i} className="text-[11px] text-muted-foreground">- {b}</li>
                                    ))}</ul>
                                  </div>
                                )}
                                {cap.integrationNotes && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Integration Notes</p>
                                    <p className="text-[11px] text-muted-foreground">{cap.integrationNotes}</p>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </CardContent>
                        </Card>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Compare Tab */}
            <TabsContent value="compare">
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <Select value={compareModule} onValueChange={setCompareModule}>
                  <SelectTrigger className="w-52 h-8 text-xs" data-testid="compare-module"><SelectValue placeholder="Select module to compare" /></SelectTrigger>
                  <SelectContent>
                    {allModules.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 flex-wrap">
                  {PLATFORMS.filter(p => p.value).map(p => (
                    <label key={p.value} className="flex items-center gap-1.5 cursor-pointer text-xs">
                      <input type="checkbox" className="accent-[#d4a853]" checked={!!comparePlatforms[p.value]}
                        onChange={e => setComparePlatforms(prev => ({ ...prev, [p.value]: e.target.checked }))}
                        data-testid={`compare-platform-${p.value}`} />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>

              {!compareModule ? (
                <p className="text-sm text-muted-foreground text-center py-12">Select a module to compare vendor capabilities</p>
              ) : selectedComparePlatforms.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">Select at least one platform to compare</p>
              ) : compareData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No capability data for this selection</p>
              ) : (
                <Table data-testid="compare-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-28">Vendor</TableHead>
                      <TableHead className="text-xs w-20 text-center">Maturity</TableHead>
                      <TableHead className="text-xs w-28">Automation</TableHead>
                      <TableHead className="text-xs">Workflow Summary</TableHead>
                      <TableHead className="text-xs w-52">Differentiators</TableHead>
                      <TableHead className="text-xs w-52">Limitations</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compareData.map((cap: any) => {
                      const diffs = parseJsonSafe(cap.differentiators);
                      const lims = parseJsonSafe(cap.limitations);
                      const mc = MATURITY_COLORS[cap.maturityRating] || "";
                      return (
                        <TableRow key={cap.id} data-testid={`compare-row-${cap.vendorPlatform}`}>
                          <TableCell><PlatformBadge platform={cap.vendorPlatform} /></TableCell>
                          <TableCell className="text-center">
                            <span className={`text-sm font-bold ${mc}`}>{cap.maturityRating || "—"}</span>
                            <span className="text-[10px] text-muted-foreground">/5</span>
                          </TableCell>
                          <TableCell>
                            {cap.automationLevel && (
                              <Badge className={`text-[9px] ${AUTO_COLORS[cap.automationLevel] || "bg-muted text-muted-foreground"}`}>
                                {cap.automationLevel.replace(/_/g, " ")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-[11px] max-w-xs">
                            <p className="line-clamp-3">{cap.workflowDescription || "—"}</p>
                          </TableCell>
                          <TableCell className="text-[11px]">
                            {diffs.length > 0 ? (
                              <ul className="space-y-0.5">{diffs.slice(0, 3).map((d: string, i: number) => (
                                <li key={i} className="flex gap-1"><span className="text-emerald-500 shrink-0">+</span><span className="line-clamp-1">{d}</span></li>
                              ))}{diffs.length > 3 && <li className="text-muted-foreground">+{diffs.length - 3} more</li>}</ul>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-[11px]">
                            {lims.length > 0 ? (
                              <ul className="space-y-0.5">{lims.slice(0, 3).map((l: string, i: number) => (
                                <li key={i} className="flex gap-1"><span className="text-red-500 shrink-0">-</span><span className="line-clamp-1">{l}</span></li>
                              ))}{lims.length > 3 && <li className="text-muted-foreground">+{lims.length - 3} more</li>}</ul>
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
