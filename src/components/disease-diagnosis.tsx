"use client";

import { useState } from "react";
import {
  Stethoscope,
  Loader2,
  Droplets,
  FlaskConical,
  Sprout,
  ShieldCheck,
  Pill,
  AlertTriangle,
  ChevronDown,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { CropHealthResult, ImageStress } from "@/lib/crop-science";
import type { Diagnosis, Confidence } from "@/lib/diagnosis";

interface Props {
  imageUrl: string; // original leaf data URL
  result: CropHealthResult;
  imagePct: ImageStress;
  greenness: number | null;
  temp: number;
  rh: number;
  soil: number;
  onDiagnosed?: (d: Diagnosis) => void;
}

const confidenceStyle: Record<Confidence, string> = {
  High: "bg-[oklch(0.92_0.06_150)] text-[oklch(0.35_0.1_150)]",
  Medium: "bg-[oklch(0.93_0.07_80)] text-[oklch(0.4_0.1_70)]",
  Low: "bg-[oklch(0.92_0.08_25)] text-[oklch(0.45_0.16_25)]",
};

export function DiseaseDiagnosis({
  imageUrl,
  result,
  imagePct,
  greenness,
  temp,
  rh,
  soil,
  onDiagnosed,
}: Props) {
  const [crop, setCrop] = useState("");
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);

  const run = async () => {
    setLoading(true);
    setDiagnosis(null);
    try {
      const resp = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageUrl,
          context: {
            cropHint: crop.trim() || undefined,
            tempC: temp,
            rh,
            soil,
            vpd: result.vpd,
            chi: result.chi,
            category: result.category,
            greenness,
            stressedPct: imagePct.stressed,
            mildPct: imagePct.mild,
          },
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Diagnosis failed");
      setDiagnosis(data.diagnosis as Diagnosis);
      onDiagnosed?.(data.diagnosis as Diagnosis);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Diagnosis failed.");
    } finally {
      setLoading(false);
    }
  };

  const isHealthy = diagnosis?.probableDisease?.toLowerCase() === "healthy";

  return (
    <div className="space-y-4">
      {!diagnosis && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The leaf shows signs of stress. Run an AI visual diagnosis to identify the probable
            disease and get a scientific treatment plan.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={crop}
                onChange={(e) => setCrop(e.target.value)}
                placeholder="Crop name (optional, e.g. tomato)"
                className="pl-9"
                disabled={loading}
              />
            </div>
            <Button onClick={run} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
              {loading ? "Diagnosing…" : "Diagnose disease"}
            </Button>
          </div>
        </div>
      )}

      {diagnosis && (
        <div className="space-y-4">
          {/* header: disease + confidence + severity */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-primary">
              <Stethoscope className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <h3 className="text-lg font-semibold leading-tight">{diagnosis.probableDisease}</h3>
              <p className="text-xs text-muted-foreground">Probable diagnosis</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${confidenceStyle[diagnosis.confidence]}`}>
              {diagnosis.confidence} confidence
            </span>
            {diagnosis.severity !== "None" && (
              <Badge variant="secondary" className="font-normal">
                {diagnosis.severity}
              </Badge>
            )}
          </div>

          {/* summary */}
          <p className="rounded-lg bg-secondary/40 px-3 py-2.5 text-sm leading-relaxed">
            {diagnosis.summary}
          </p>

          {/* differential */}
          {diagnosis.alsoConsider?.length > 0 && (
            <div className="text-sm">
              <span className="font-medium text-muted-foreground">Also consider: </span>
              <span className="text-foreground">{diagnosis.alsoConsider.join(" · ")}</span>
            </div>
          )}

          {/* treatment sections (hidden when healthy) */}
          {!isHealthy && (
            <div className="space-y-2">
              <Section icon={<Droplets className="h-4 w-4" />} title="Irrigation" body={diagnosis.irrigation} defaultOpen />
              <Section icon={<FlaskConical className="h-4 w-4" />} title="Soil amendments" body={diagnosis.soil} />
              <Section icon={<Sprout className="h-4 w-4" />} title="Fertiliser (type & dosage)" body={diagnosis.fertiliser} />
              <Section icon={<Pill className="h-4 w-4" />} title="Treatment" body={diagnosis.treatment} />
              <Section icon={<ShieldCheck className="h-4 w-4" />} title="Prevention" body={diagnosis.prevention} />
            </div>
          )}

          {/* safety caveat — always shown */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{diagnosis.caveat}</span>
          </div>

          <Button variant="outline" size="sm" onClick={run} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
            Re-diagnose
          </Button>
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  body,
  defaultOpen = false,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!body) return null;
  return (
    <div className="overflow-hidden rounded-lg border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-secondary/50"
      >
        <span className="text-primary">{icon}</span>
        <span className="flex-1">{title}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <p className="border-t bg-secondary/20 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      )}
    </div>
  );
}
