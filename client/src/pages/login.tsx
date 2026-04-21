import { Sparkles } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden" style={{ backgroundImage: "var(--shell-background)", backgroundAttachment: "fixed" }}>
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[480px] w-[600px] -translate-x-1/2 rounded-full bg-amber-300/20 blur-[120px]" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-blue-400/10 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-[420px] px-6">
        {/* Card */}
        <div className="glass-panel-strong overflow-hidden rounded-[32px] border border-white/50 dark:border-white/10">
          {/* Hero band */}
          <div className="hero-surface px-8 pb-8 pt-10 text-center text-white">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] bg-white/15 shadow-lg backdrop-blur">
              <img src="/avero-logo.png" alt="Avero" className="h-7 brightness-0 invert" />
            </div>
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-[28px] font-semibold tracking-[-0.04em]">Caliber</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white/90">
                <Sparkles className="h-3 w-3" />
                AI
              </span>
            </div>
            <p className="mt-2 text-sm text-white/70">
              Executive delivery workspace for advisory engagements.
            </p>
          </div>

          {/* Sign in area */}
          <div className="px-8 pb-8 pt-6">
            <p className="mb-5 text-center text-sm text-muted-foreground">
              Sign in with your organization account to continue.
            </p>
            <a
              href="/auth/google"
              className="group flex w-full items-center justify-center gap-3 rounded-2xl border border-border/70 bg-white px-5 py-3.5 text-sm font-medium text-foreground shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-sm dark:bg-white/5 dark:hover:bg-white/10"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </a>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground/70">
          by Avero Advisors
        </p>
      </div>
    </div>
  );
}
