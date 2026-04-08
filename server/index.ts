import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import type { User } from "@shared/schema";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    passport: { user: number };
  }
}

// Body parsing
app.use(
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

// Session
const sessionSecret = process.env.SESSION_SECRET || "caliber-dev-secret-change-in-production";
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production" && !!process.env.FORCE_HTTPS,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: "lax",
  },
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser((id: number, done) => {
  const user = storage.getUser(id);
  done(null, user || null);
});

// Google OAuth Strategy — only configure if credentials are present
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (googleClientId && googleClientSecret) {
  passport.use(new GoogleStrategy({
    clientID: googleClientId,
    clientSecret: googleClientSecret,
    callbackURL: "/auth/google/callback",
  }, (_accessToken, _refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error("No email from Google"), undefined);
    const user = storage.findOrCreateUser({
      googleId: profile.id,
      email,
      name: profile.displayName || email,
      picture: profile.photos?.[0]?.value,
    });
    return done(null, user);
  }));
}

// Auth routes
app.get("/auth/google", (req, res, next) => {
  if (!googleClientId) return res.status(503).json({ error: "Google OAuth not configured" });
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/#/login?error=auth_failed" }),
  (_req, res) => { res.redirect("/"); }
);

app.get("/auth/me", (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user as User;
    return res.json({ id: user.id, name: user.name, email: user.email, picture: user.picture, role: user.role });
  }
  // If Google OAuth is not configured, return a flag so frontend skips login
  if (!googleClientId) {
    return res.json({ authRequired: false });
  }
  res.json(null);
});

app.post("/auth/logout", (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });
});

// Auth middleware — protect /api routes but allow public endpoints
function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Public endpoints that don't require auth
  if (req.path.startsWith("/api/workshop/")) return next();
  if (req.path === "/auth/me" || req.path === "/auth/google" || req.path.startsWith("/auth/")) return next();

  // If Google OAuth is not configured, allow all requests (dev mode)
  if (!googleClientId) return next();

  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Authentication required" });
}

app.use("/api", requireAuth);

// Logging
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
    if (googleClientId) log("Google OAuth enabled");
    else log("Google OAuth NOT configured — all requests allowed (dev mode)");
  });
})();
