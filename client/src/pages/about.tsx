import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, Lock, Server, FileCheck } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border/50 bg-card/50 backdrop-blur-sm shrink-0">
        <h1 className="text-lg font-semibold text-foreground">About Caliber</h1>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 max-w-3xl mx-auto space-y-6">
          {/* Product overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Caliber by Avero Advisors</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Caliber is a vendor evaluation and IV&V compliance platform purpose-built for government ERP consulting.
                It helps consultants manage requirements, evaluate vendors, track project health, and ensure compliance
                throughout the implementation lifecycle.
              </p>
            </CardContent>
          </Card>

          {/* AI Data Processing Disclosure */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-[#d4a853]" />AI & Data Processing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Lock className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Caliber uses enterprise-grade cloud AI infrastructure to perform document analysis, synthesis, and scoring.
                  All data is transmitted over encrypted connections (TLS 1.2+).
                </p>
              </div>

              <div className="flex gap-3">
                <FileCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Caliber's AI providers operate under contractual data processing agreements that prohibit the use of your
                  data for model training or any purpose other than generating the requested analysis.
                </p>
              </div>

              <div className="flex gap-3">
                <Server className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Data submitted for analysis is not retained by AI infrastructure providers beyond standard abuse-monitoring
                  windows (typically 30 days or less).
                </p>
              </div>

              <div className="flex gap-3">
                <Shield className="w-5 h-5 text-[#d4a853] shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Caliber does not sell, share, or transfer client data to any third party outside of these processing agreements.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
