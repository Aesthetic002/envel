"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Leaf } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { AppHeader } from "@/components/app-header";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, configured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && configured && !user) {
      router.replace("/");
    }
  }, [loading, user, configured, router]);

  // While Firebase isn't configured we still let the page render so the
  // developer can see the UI; a banner in the page explains setup.
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
        <Leaf className="h-8 w-8 animate-pulse text-primary" />
        <p className="text-sm">Loading AgriSpectra…</p>
      </div>
    );
  }

  if (configured && !user) {
    return null; // redirecting
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
