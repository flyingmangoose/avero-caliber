import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { ChatPanel } from "@/components/chat-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Users,
  ThumbsUp,
  Flag,
  LinkIcon,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ==================== TYPES ====================

interface FeedbackStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  flagged: number;
  commented: number;
}

interface WorkshopLinkData {
  id: number;
  stakeholderName: string;
  stakeholderEmail: string;
  modules: string[];
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
  feedbackStats: FeedbackStats;
}

interface CriticalityChange {
  reqId: number;
  reqNumber: string;
  module: string;
  originalCriticality: string;
  stakeholderCriticality: string;
  stakeholderName: string;
}

interface TopConcern {
  reqId: number;
  reqNumber: string;
  module: string;
  description: string;
  flagCount: number;
  commentCount: number;
  comments: Array<{ stakeholder: string; comment: string }>;
}

interface ModuleBreakdown {
  module: string;
  feedbackCount: number;
  approvedCount: number;
  rejectedCount: number;
  flaggedCount: number;
}

interface ConsensusItem {
  reqId: number;
  reqNumber: string;
  module: string;
  description: string;
  allApproved: boolean;
  allRejected: boolean;
  mixed: boolean;
}

interface WorkshopSummary {
  links: WorkshopLinkData[];
  aggregated: {
    totalFeedback: number;
    approvalRate: number;
    flaggedCount: number;
    criticalityChanges: CriticalityChange[];
    topConcerns: TopConcern[];
    moduleBreakdown: ModuleBreakdown[];
    consensusItems: ConsensusItem[];
  };
  totalLinks: number;
}

// ==================== MAIN PAGE ====================

export default function StakeholderFeedback() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");

  const [expandedLinks, setExpandedLinks] = useState<Set<number>>(new Set());
  const [expandedConcerns, setExpandedConcerns] = useState<Set<number>>(new Set());

  const { data: project } = useQuery({
    queryKey: ["/api/projects", projectId],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}`).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data, isLoading } = useQuery<WorkshopSummary>({
    queryKey: ["/api/projects", projectId, "workshop-summary"],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}/workshop-summary`).then(r => r.json()),
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const summary = data;
  const agg = summary?.aggregated;
  const activeLinksCount = summary?.links.filter(l => l.isActive).length || 0;

  // Module chart data
  const moduleChartData = (agg?.moduleBreakdown || []).map(m => ({
    name: m.module.length > 18 ? m.module.slice(0, 16) + "…" : m.module,
    fullName: m.module,
    Approved: m.approvedCount,
    Rejected: m.rejectedCount,
    Flagged: m.flaggedCount,
    Pending: m.feedbackCount - m.approvedCount - m.rejectedCount,
  }));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
              <ChevronLeft className="w-4 h-4" />
              {project?.name || "Project"}
            </Button>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#d4a853]" />
            Stakeholder Feedback
          </h1>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-5">

          {/* Overview KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="kpi-overview">
            <Card data-testid="kpi-total-responses">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Responses</p>
                    <p className="text-2xl font-bold text-foreground">{agg?.totalFeedback || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="kpi-approval-rate">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <ThumbsUp className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Approval Rate</p>
                    <p className="text-2xl font-bold text-foreground">{agg?.approvalRate || 0}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="kpi-flagged">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Flag className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Flagged for Discussion</p>
                    <p className="text-2xl font-bold text-foreground">{agg?.flaggedCount || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="kpi-active-links">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <LinkIcon className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Links</p>
                    <p className="text-2xl font-bold text-foreground">{activeLinksCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* No data state */}
          {(!summary || summary.totalLinks === 0) && (
            <Card>
              <CardContent className="py-12 flex flex-col items-center text-center gap-3">
                <MessageSquare className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">No workshop links created yet</p>
                <p className="text-xs text-muted-foreground">Create workshop links from the project view to collect stakeholder feedback.</p>
              </CardContent>
            </Card>
          )}

          {summary && summary.totalLinks > 0 && (
            <>
              {/* Stakeholder Activity table */}
              <Card data-testid="card-stakeholder-activity">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#d4a853]" />
                    Stakeholder Activity
                    <Badge variant="outline" className="ml-auto text-[11px]">{summary.links.length} links</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs text-muted-foreground">Stakeholder</TableHead>
                        <TableHead className="text-xs text-muted-foreground">Modules</TableHead>
                        <TableHead className="text-xs text-muted-foreground text-center">Responses</TableHead>
                        <TableHead className="text-xs text-muted-foreground text-center">Approved</TableHead>
                        <TableHead className="text-xs text-muted-foreground text-center">Rejected</TableHead>
                        <TableHead className="text-xs text-muted-foreground text-center">Flagged</TableHead>
                        <TableHead className="text-xs text-muted-foreground text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.links.map(link => {
                        const isExpanded = expandedLinks.has(link.id);
                        return [
                          <TableRow
                            key={link.id}
                            className="hover:bg-muted/30 cursor-pointer"
                            onClick={() => {
                              setExpandedLinks(prev => {
                                const next = new Set(prev);
                                if (next.has(link.id)) next.delete(link.id); else next.add(link.id);
                                return next;
                              });
                            }}
                            data-testid={`stakeholder-row-${link.id}`}
                          >
                            <TableCell className="py-3">
                              <div className="flex items-center gap-2">
                                {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                                <div>
                                  <p className="text-xs font-medium text-foreground">{link.stakeholderName}</p>
                                  {link.stakeholderEmail && <p className="text-[10px] text-muted-foreground">{link.stakeholderEmail}</p>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex flex-wrap gap-1">
                                {link.modules.length === 0 ? (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0">All</Badge>
                                ) : link.modules.slice(0, 3).map(m => (
                                  <Badge key={m} variant="outline" className="text-[9px] px-1 py-0">{m.length > 12 ? m.slice(0, 10) + "…" : m}</Badge>
                                ))}
                                {link.modules.length > 3 && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0">+{link.modules.length - 3}</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-3 text-center">
                              <span className="text-xs font-semibold text-foreground">{link.feedbackStats.total}</span>
                            </TableCell>
                            <TableCell className="py-3 text-center">
                              <span className="text-xs font-semibold text-green-400">{link.feedbackStats.approved}</span>
                            </TableCell>
                            <TableCell className="py-3 text-center">
                              <span className="text-xs font-semibold text-red-400">{link.feedbackStats.rejected}</span>
                            </TableCell>
                            <TableCell className="py-3 text-center">
                              <span className="text-xs font-semibold text-amber-400">{link.feedbackStats.flagged}</span>
                            </TableCell>
                            <TableCell className="py-3 text-center">
                              <Badge variant={link.isActive ? "outline" : "secondary"} className={`text-[10px] px-1.5 py-0 ${link.isActive ? "text-green-400 border-green-500/30" : "text-muted-foreground"}`}>
                                {link.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                          </TableRow>,
                          ...(isExpanded ? [
                            <TableRow key={`${link.id}-detail`} className="bg-muted/10">
                              <TableCell colSpan={7} className="py-3">
                                <div className="grid grid-cols-3 gap-4 text-xs pl-5">
                                  <div>
                                    <p className="text-muted-foreground">Created</p>
                                    <p className="font-medium">{new Date(link.createdAt).toLocaleDateString()}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Expires</p>
                                    <p className="font-medium">{link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : "Never"}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Comments Left</p>
                                    <p className="font-medium">{link.feedbackStats.commented}</p>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>,
                          ] : []),
                        ];
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Concerns & Flags */}
              {agg && agg.topConcerns.length > 0 && (
                <Card data-testid="card-concerns">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Flag className="w-4 h-4 text-amber-400" />
                      Concerns & Flags
                      <Badge variant="outline" className="ml-auto text-[11px] text-amber-400 border-amber-500/30">
                        {agg.topConcerns.length} items
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {agg.topConcerns.slice(0, 10).map(concern => {
                        const isExpanded = expandedConcerns.has(concern.reqId);
                        return (
                          <div key={concern.reqId} className="border border-border/50 rounded-lg overflow-hidden">
                            <button
                              className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30 transition-colors text-left"
                              onClick={() => {
                                setExpandedConcerns(prev => {
                                  const next = new Set(prev);
                                  if (next.has(concern.reqId)) next.delete(concern.reqId); else next.add(concern.reqId);
                                  return next;
                                });
                              }}
                              data-testid={`concern-${concern.reqNumber}`}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <span className="text-[11px] font-mono text-muted-foreground shrink-0">{concern.reqNumber}</span>
                                <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{concern.module}</Badge>
                                <span className="text-xs text-foreground/90 truncate">{concern.description}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-3">
                                {concern.flagCount > 0 && (
                                  <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                    {concern.flagCount} flags
                                  </Badge>
                                )}
                                {concern.commentCount > 0 && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {concern.commentCount} comments
                                  </Badge>
                                )}
                                {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                              </div>
                            </button>
                            {isExpanded && concern.comments.length > 0 && (
                              <div className="border-t border-border/50 px-4 py-3 space-y-2 bg-muted/10">
                                {concern.comments.map((c, i) => (
                                  <div key={i} className="flex gap-2">
                                    <span className="text-[11px] font-semibold text-[#d4a853] shrink-0">{c.stakeholder}:</span>
                                    <span className="text-[11px] text-foreground/80">{c.comment}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Criticality Disagreements */}
              {agg && agg.criticalityChanges.length > 0 && (
                <Card data-testid="card-criticality-disagreements">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      Criticality Disagreements
                      <Badge variant="outline" className="ml-auto text-[11px]">{agg.criticalityChanges.length} changes</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs text-muted-foreground w-16">Req #</TableHead>
                          <TableHead className="text-xs text-muted-foreground">Module</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-center">Original</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-center">Stakeholder</TableHead>
                          <TableHead className="text-xs text-muted-foreground">By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agg.criticalityChanges.slice(0, 20).map((change, i) => (
                          <TableRow key={`${change.reqId}-${i}`} className="hover:bg-muted/30" data-testid={`crit-change-${change.reqNumber}`}>
                            <TableCell className="py-2 text-[11px] font-mono text-muted-foreground">{change.reqNumber}</TableCell>
                            <TableCell className="py-2 text-xs text-foreground/90">{change.module}</TableCell>
                            <TableCell className="py-2 text-center">
                              <Badge variant={change.originalCriticality === "Critical" ? "destructive" : "outline"} className="text-[10px] px-1.5 py-0">
                                {change.originalCriticality}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2 text-center">
                              <Badge variant={change.stakeholderCriticality === "Critical" ? "destructive" : "outline"} className="text-[10px] px-1.5 py-0">
                                {change.stakeholderCriticality}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2 text-xs text-muted-foreground">{change.stakeholderName}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Module Feedback Chart */}
              {moduleChartData.length > 0 && (
                <Card data-testid="card-module-chart">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-[#d4a853]" />
                      Module-Level Feedback
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[280px]" data-testid="chart-module-feedback">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={moduleChartData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                          <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }} width={120} />
                          <RechartsTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length > 0) {
                                const d = payload[0]?.payload;
                                return (
                                  <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                                    <p className="text-sm font-semibold text-foreground mb-1">{d?.fullName}</p>
                                    {payload.map((p: any) => (
                                      <p key={p.dataKey} className="text-xs" style={{ color: p.color }}>{p.name}: {p.value}</p>
                                    ))}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="Approved" stackId="a" fill="#22c55e" />
                          <Bar dataKey="Rejected" stackId="a" fill="#ef4444" />
                          <Bar dataKey="Flagged" stackId="a" fill="#f59e0b" />
                          <Bar dataKey="Pending" stackId="a" fill="#6b7280" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Consensus Analysis */}
              {agg && agg.consensusItems.length > 0 && (
                <Card data-testid="card-consensus">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      Consensus Analysis
                      <span className="text-xs text-muted-foreground font-normal ml-1">Requirements with multiple stakeholder reviews</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                        <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wider">All Approved</p>
                        <p className="text-xl font-bold text-green-400" data-testid="consensus-all-approved">
                          {agg.consensusItems.filter(c => c.allApproved).length}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                        <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">All Rejected</p>
                        <p className="text-xl font-bold text-red-400" data-testid="consensus-all-rejected">
                          {agg.consensusItems.filter(c => c.allRejected).length}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                        <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Mixed / Disagreement</p>
                        <p className="text-xl font-bold text-amber-400" data-testid="consensus-mixed">
                          {agg.consensusItems.filter(c => c.mixed).length}
                        </p>
                      </div>
                    </div>

                    {agg.consensusItems.filter(c => c.mixed).length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Disagreements Requiring Discussion</p>
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="text-xs text-muted-foreground w-16">Req #</TableHead>
                              <TableHead className="text-xs text-muted-foreground">Module</TableHead>
                              <TableHead className="text-xs text-muted-foreground">Description</TableHead>
                              <TableHead className="text-xs text-muted-foreground text-center w-20">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {agg.consensusItems.filter(c => c.mixed).slice(0, 15).map(item => (
                              <TableRow key={item.reqId} className="hover:bg-muted/30" data-testid={`consensus-row-${item.reqNumber}`}>
                                <TableCell className="py-2 text-[11px] font-mono text-muted-foreground">{item.reqNumber}</TableCell>
                                <TableCell className="py-2 text-xs text-foreground/90">{item.module}</TableCell>
                                <TableCell className="py-2 text-[11px] text-foreground/80 line-clamp-2">{item.description}</TableCell>
                                <TableCell className="py-2 text-center">
                                  <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                    Mixed
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </ScrollArea>
      <ChatPanel projectId={projectId} projectName={project?.name || "Project"} />
    </div>
  );
}
