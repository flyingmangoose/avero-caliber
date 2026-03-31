import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4" data-testid="page-not-found">
      <FileQuestion className="w-16 h-16 text-muted-foreground/30 mb-4" />
      <h1 className="text-lg font-bold mb-1">Page Not Found</h1>
      <p className="text-sm text-muted-foreground mb-4">
        The page you're looking for doesn't exist.
      </p>
      <Link href="/">
        <Button variant="outline" size="sm">Back to Dashboard</Button>
      </Link>
    </div>
  );
}
