"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  History as HistoryIcon,
  Trash2,
  MapPin,
  Leaf,
  Loader2,
  ImageOff,
  Eye,
  Download,
} from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { fetchHistory, deleteHistory, type HistoryRecord } from "@/lib/history";
import { firebaseConfigured } from "@/lib/firebase";

export default function HistoryPage() {
  return (
    <ProtectedRoute>
      <HistoryView />
    </ProtectedRoute>
  );
}

/**
 * Turn a Cloudinary delivery URL into a forced-download URL by inserting the
 * `fl_attachment` flag after `/upload/`. Falls back to the original URL for
 * non-Cloudinary links.
 */
function toDownloadUrl(url: string): string {
  if (url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/fl_attachment/");
  }
  return url;
}

function categoryTone(category: string): "good" | "warn" | "bad" {
  if (category === "Healthy") return "good";
  if (category === "Moderately Stressed") return "warn";
  return "bad";
}

const toneStyles: Record<string, string> = {
  good: "bg-[oklch(0.92_0.06_150)] text-[oklch(0.35_0.1_150)]",
  warn: "bg-[oklch(0.93_0.07_80)] text-[oklch(0.4_0.1_70)]",
  bad: "bg-[oklch(0.92_0.08_25)] text-[oklch(0.45_0.16_25)]",
};

function HistoryView() {
  const { user } = useAuth();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const recs = await fetchHistory(user.uid);
      setRecords(recs);
    } catch (e) {
      // Surface the real Firestore error — usually a missing composite index
      // (the message includes a one-click link to create it) or rules.
      console.error("History load failed:", e);
      const msg = e instanceof Error ? e.message : "";
      if (msg.toLowerCase().includes("index")) {
        toast.error(
          "Firestore needs a one-time index. Open the browser console (F12) and click the link in the error to create it.",
          { duration: 10000 },
        );
      } else {
        toast.error(
          msg ? `Couldn't load history: ${msg}` : "Couldn't load history. See SETUP.md.",
          { duration: 8000 },
        );
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (firebaseConfigured) load();
    else setLoading(false);
  }, [load]);

  const onDelete = async (id: string) => {
    setDeleting(id);
    try {
      await deleteHistory(id);
      setRecords((r) => r.filter((x) => x.id !== id));
      toast.success("Deleted.");
    } catch {
      toast.error("Delete failed.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <HistoryIcon className="h-6 w-6 text-primary" /> History
          </h1>
          <p className="text-sm text-muted-foreground">Your saved crop health checks.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">New analysis</Link>
        </Button>
      </div>

      {!firebaseConfigured ? (
        <EmptyState
          icon={<Leaf className="h-8 w-8" />}
          title="History needs Firebase"
          desc="Add your Firebase + Cloudinary keys to .env.local to start saving checks. See SETUP.md."
        />
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon className="h-8 w-8" />}
          title="No history yet"
          desc="Run an analysis on the dashboard and hit “Save to history” to see it here."
          action={
            <Button asChild className="mt-4">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {records.map((rec) => (
            <Card key={rec.id} className="overflow-hidden p-0">
              <div className="group relative aspect-video w-full bg-muted">
                {rec.imageUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={rec.imageUrl} alt="Leaf stress map" className="h-full w-full object-cover" />
                    {/* hover overlay with view / download actions */}
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/55 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
                      <a
                        href={rec.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-sm transition hover:bg-white"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </a>
                      <a
                        href={toDownloadUrl(rec.imageUrl)}
                        download={`agrispectra-${rec.chi}-${rec.id}.png`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                    <ImageOff className="h-6 w-6" />
                    <span className="text-xs">No image</span>
                  </div>
                )}
                <span
                  className={`pointer-events-none absolute right-2 top-2 rounded-full px-2.5 py-1 text-xs font-medium ${toneStyles[categoryTone(rec.category)]}`}
                >
                  {rec.chi}/100
                </span>
              </div>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="font-normal">
                    {rec.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {rec.createdAt.toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>

                {rec.locationName && (
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 text-primary" /> {rec.locationName}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-1.5 pt-1 text-center text-xs">
                  <MiniStat label="Temp" value={`${rec.tempC.toFixed(0)}°`} />
                  <MiniStat label="RH" value={`${rec.rh}%`} />
                  <MiniStat label="Soil" value={`${rec.soil}%`} />
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 w-full text-muted-foreground hover:text-destructive"
                  disabled={deleting === rec.id}
                  onClick={() => onDelete(rec.id)}
                >
                  {deleting === rec.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 py-1.5">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold text-foreground">{value}</p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-primary">
        {icon}
      </span>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{desc}</p>
      {action}
    </div>
  );
}
