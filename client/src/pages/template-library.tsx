import { useState, useMemo } from "react";
import { templateRequirements, CATEGORIES, MODULE_PREFIXES } from "@shared/templates";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, BookTemplate, ChevronRight } from "lucide-react";

export default function TemplateLibrary() {
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTemplates = useMemo(() => {
    let templates = templateRequirements;
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
  }, [selectedArea, searchQuery]);

  // Count templates per area
  const areaCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of templateRequirements) {
      counts[t.functionalArea] = (counts[t.functionalArea] || 0) + 1;
    }
    return counts;
  }, []);

  return (
    <div className="flex h-full" data-testid="page-template-library">
      {/* Module list */}
      <div className="w-64 shrink-0 border-r bg-card/50 flex flex-col">
        <div className="p-3 border-b">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <BookTemplate className="w-4 h-4 text-primary dark:text-accent" />
            Template Library
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {templateRequirements.length} pre-built requirements across {Object.keys(areaCounts).length} modules
          </p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            <button
              onClick={() => setSelectedArea(null)}
              className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors mb-1 ${
                !selectedArea ? "bg-primary text-primary-foreground dark:bg-accent dark:text-accent-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              All Templates ({templateRequirements.length})
            </button>
            {Object.entries(CATEGORIES).map(([cat, areas]) => (
              <div key={cat} className="mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2.5 py-1">{cat}</p>
                {areas.map((area) => {
                  const count = areaCounts[area] || 0;
                  if (count === 0) return null;
                  return (
                    <button
                      key={area}
                      onClick={() => setSelectedArea(area)}
                      className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${
                        selectedArea === area
                          ? "bg-primary text-primary-foreground dark:bg-accent dark:text-accent-foreground"
                          : "text-foreground/80 hover:bg-muted"
                      }`}
                      data-testid={`button-template-module-${MODULE_PREFIXES[area]}`}
                    >
                      <span className="truncate">{area}</span>
                      <span className={`text-[10px] font-mono ${selectedArea === area ? "opacity-80" : "text-muted-foreground"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 p-3 border-b shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
              data-testid="input-search-templates"
            />
          </div>
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredTemplates.length} templates
          </span>
        </div>

        <div className="flex-1 overflow-auto">
          {filteredTemplates.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-[11px] font-semibold w-[60px]">Prefix</TableHead>
                  {!selectedArea && <TableHead className="text-[11px] font-semibold w-[140px]">Module</TableHead>}
                  <TableHead className="text-[11px] font-semibold w-[120px]">Sub Category</TableHead>
                  <TableHead className="text-[11px] font-semibold">Description</TableHead>
                  <TableHead className="w-[80px] text-[11px] font-semibold text-center">Criticality</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((t, i) => (
                  <TableRow key={i} data-testid={`row-template-${i}`}>
                    <TableCell className="font-mono text-xs font-semibold text-primary dark:text-accent py-2">{t.prefix}</TableCell>
                    {!selectedArea && <TableCell className="text-xs py-2">{t.functionalArea}</TableCell>}
                    <TableCell className="text-xs text-muted-foreground py-2">{t.subCategory}</TableCell>
                    <TableCell className="text-xs py-2 max-w-md">
                      <p className="line-clamp-2">{t.description}</p>
                    </TableCell>
                    <TableCell className="text-center py-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold px-1.5 py-0 ${
                          t.criticality === "Critical"
                            ? "bg-primary/10 text-primary border-primary/20 dark:bg-accent/15 dark:text-accent dark:border-accent/25"
                            : "bg-muted text-muted-foreground border-muted"
                        }`}
                      >
                        {t.criticality}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BookTemplate className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <h3 className="text-sm font-semibold mb-1">No templates match</h3>
              <p className="text-xs text-muted-foreground">Try adjusting your search or selecting a different module.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
