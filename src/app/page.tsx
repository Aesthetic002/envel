"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Leaf, ScanLine, Gauge, Sparkles, AlertCircle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const features = [
  { icon: ScanLine, title: "Leaf stress mapping", desc: "Upload a photo, get a color-coded health map in seconds." },
  { icon: Gauge, title: "Crop Health Index", desc: "Live weather + soil fused into one 0–100 score." },
  { icon: Sparkles, title: "AI farm assistant", desc: "Personalised, plain-language advice for your field." },
];

export default function LandingPage() {
  const { user, loading, configured, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  const handleSignIn = async () => {
    if (!configured) {
      toast.error("Firebase isn't configured yet. Add your keys to .env.local — see SETUP.md.");
      return;
    }
    try {
      setSigningIn(true);
      await signInWithGoogle();
      router.replace("/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="agri-gradient flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-2 px-6 py-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Leaf className="h-5 w-5" />
        </span>
        <span className="text-lg font-semibold tracking-tight">AgriSpectra</span>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-12 px-6 py-12 lg:flex-row lg:gap-16">
        {/* Hero copy */}
        <div className="max-w-xl text-center lg:text-left">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Multispectral-style analysis, no sensors required
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Know your crop&apos;s health{" "}
            <span className="text-primary">before</span> it shows.
          </h1>
          <p className="mt-4 text-pretty text-lg text-muted-foreground">
            Snap a leaf, pull in live weather, and let AgriSpectra fuse it all into a clear
            health score with actionable, AI-powered advice.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:items-start">
            <Button size="lg" className="h-12 gap-2 px-6 text-base" onClick={handleSignIn} disabled={signingIn}>
              <GoogleIcon />
              {signingIn ? "Signing in…" : "Continue with Google"}
            </Button>
          </div>

          {!configured && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-left text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Firebase keys aren&apos;t set yet. The app runs, but sign-in is disabled until you
                fill in <code className="font-mono">.env.local</code> — see <code className="font-mono">SETUP.md</code>.
              </span>
            </div>
          )}
        </div>

        {/* Feature cards */}
        <div className="grid w-full max-w-md gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-4 rounded-2xl border bg-card/70 p-5 shadow-sm backdrop-blur transition-transform hover:-translate-y-0.5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <f.icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 py-6 text-center text-xs text-muted-foreground">
        AgriSpectra · Intelligent Crop Health Monitoring
      </footer>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.3C39.9 34.9 44 30 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
