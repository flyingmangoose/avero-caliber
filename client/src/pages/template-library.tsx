import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { MODULE_PREFIXES } from "@shared/templates";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Search, BookTemplate, Sparkles } from "lucide-react";

interface TemplateItem {
  category: string;
  functionalArea: string;
  prefix: string;
  subCategory: string;
  description: string;
  criticality: string;
}

interface TemplateSummary {
  categories: Record<string, string[]>;
  prefixes: Record<string, string>;
  summary: Record<string, Record<string, number>>;
  totalCount: number;
}

interface TemplateData {
  categories: Record<string, string[]>;
  prefixes: Record<string, string>;
  grouped: Record<string, Record<string, TemplateItem[]>>;
}

export default function TemplateLibrary() {
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Lightweight summary for sidebar counts
  const { data: summary } = useQuery<TemplateSummary>({
    queryKey: ["/api/templates/summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/templates/summary");
      return res.json();
    },
    staleTime: Infinity,
  });

  // Full template data (only fetched once, cached)
  const { data: templateData, isLoading } = useQuery<TemplateData>({
    queryKey: ["/api/templates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/templates");
      return res.json();
    },
    staleTime: Infinity,
  });

  const areaCounts = useMemo(() => {
    if (!summary) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const modCounts of Object.values(summary.summary)) {
      for (const [mod, count] of Object.entries(modCounts)) {
        counts[mod] = count;
      }
    }
    return counts;
  }, [summary]);

  const CATEGORIES = summary?.categories || {};
  const totalCount = summary?.totalCount || 0;

  // Flatten and filter templates
  const filteredTemplates = useMemo(() => {
    if (!templateData) return [] as TemplateItem[];
    let templates: TemplateItem[] = [];
    for (const areas of Object.values(templateData.grouped)) {
      for (const items of Object.values(areas)) {
        templates = templates.concat(items);
      }
    }
    if (selectedArea) {
      templates = templates.filter(t => t.functionalArea === selectedArea);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      templates = templates.filter(t =>
        t.description.toLowerCase().includes(q) ||
        t.functionalArea.toLowerCase().includes(q) ||
        t.subCategory.toLowerCase().includes(q)
      );
    }
    return templates;
  }, [templateData, selectedArea, searchQuery]);

  const selectedLabel = selectedArea ?? "All modules";

  return (
    <div className="mx-auto flex h-full max-w-[1480px] gap-4 p-4 sm:p-6" data-testid="page-template-library">
      {/* Sidebar */}
      <aside className="glass-panel flex w-72 shrink-0 flex-col overflow-hidden rounded-[28px]">
        <div className="border-b border-border/50 bg-gradient-to-br from-white/80 via-white/60 to-transparent px-5 py-5 dark:from-slate-950/50 dark:via-slate-950/30">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Assets</p>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-[-0.03em] text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/15 text-amber-600 dark:text-amber-300">
              <BookTemplate className="h-4 w-4" />
            </span>
            Template Library
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {totalCount.toLocaleString()} pre-built requirements
            {Object.keys(areaCounts).length > 0 ? (
              <> across {Object.keys(areaCounts).length} modules</>
            ) : null}
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-3 p-3">
            <button
              onClick={() => setSelectedArea(null)}
              className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors ${
                !selectedArea
                  ? "bg-foreground text-background shadow-xs"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              }`}
              data-testid="button-template-all"
            >
              <span>All Templates</span>
              <span className={`font-mono text-xs ${!selectedArea ? "text-background/70" : "text-muted-foreground"}`}>
                {totalCount.toLocaleString()}
              </span>
            </button>

            {Object.entries(CATEGORIES).map(([cat, areas]) => (
              <div key={cat} className="space-y-1">
                <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/80">
                  {cat}
                </p>
                <div className="space-y-0.5">
                  {areas.map((area) => {
                    const count = areaCounts[area] || 0;
                    if (count === 0) return null;
                    const isActive = selectedArea === area;
                    return (
                      <button
                        key={area}
                        onClick={() => setSelectedArea(area)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? "bg-amber-400/15 text-foreground ring-1 ring-amber-300/50 dark:bg-amber-400/10"
                            : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                        }`}
                        data-testid={`button-template-module-${MODULE_PREFIXES[area]}`}
                      >
                        <span className="truncate">{area}</span>
                        <span className={`font-mono text-[11px] ${isActive ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground/80"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Main content */}
      <section className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Hero strip */}
        <div className="glass-panel flex flex-col gap-4 rounded-[28px] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Catalog</p>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-[28px]">
              {selectedLabel}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Curated requirements ready to seed an engagement. Search by description, module, or sub-category.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/70 bg-amber-50/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
              <Sparkles className="h-3 w-3" />
              {filteredTemplates.length} match{filteredTemplates.length === 1 ? "" : "es"}
            </span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="glass-panel flex flex-col gap-3 rounded-[24px] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search templates by description, module, or sub-category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 pl-11"
              data-testid="input-search-templates"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {selectedArea ? (
              <>
                <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1.5 font-medium">
                  {selectedArea}
                </span>
                <button
                  className="rounded-full border border-border/60 bg-background/60 px-3 py-1.5 font-medium transition-colors hover:bg-background"
                  onClick={() => setSelectedArea(null)}
                >
                  Clear filter
                </button>
              </>
            ) : (
              <span>Browse the full catalog or pick a module.</span>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="glass-panel flex-1 min-h-0 overflow-hidden rounded-[28px]">
          {isLoading ? (
            <div className="space-y-2 p-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-2xl" />
              ))}
            </div>
          ) : filteredTemplates.length > 0 ? (
            <ScrollArea className="h-full">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/50 bg-background/40 hover:bg-background/40">
                    <TableHead className="w-[72px] pl-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Prefix
                    </TableHead>
                    {!selectedArea && (
                      <TableHead className="w-[180px] text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Module
                      </TableHead>
                    )}
                    <TableHead className="w-[160px] text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Sub Category
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Description
                    </TableHead>
                    <TableHead className="w-[110px] pr-6 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Criticality
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.map((t, i) => (
                    <TableRow
                      key={i}
                      className="border-b border-border/40 transition-colors hover:bg-foreground/[0.02]"
                      data-testid={`row-template-${i}`}
                    >
                      <TableCell className="pl-6 font-mono text-xs font-semibold text-amber-700 dark:text-amber-300">
                        {t.prefix}
                      </TableCell>
                      {!selectedArea && (
                        <TableCell className="text-sm text-foreground/90">{t.functionalArea}</TableCell>
                      )}
                      <TableCell className="text-sm text-muted-foreground">{t.subCategory}</TableCell>
                      <TableCell className="max-w-md text-sm text-foreground/90">
                        <p className="line-clamp-2">{t.description}</p>
                      </TableCell>
                      <TableCell className="pr-6 text-center">
                        <Badge
                          variant="outline"
                          className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            t.criticality === "Critical"
                              ? "border-amber-300/70 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200"
                              : "border-border/70 bg-background/60 text-muted-foreground"
                          }`}
                        >
                          {t.criticality}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <div className="flex h-full flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] bg-amber-400/15 text-amber-600 dark:text-amber-300">
                <BookTemplate className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold tracking-[-0.02em]">No templates match</h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Try adjusting your search or selecting a different module from the sidebar.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
