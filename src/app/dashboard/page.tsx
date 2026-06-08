"use client";

import { useMemo, useState } from "react";
import {
  Thermometer,
  Droplets,
  Sprout,
  Wind,
  Upload,
  ImageIcon,
  Loader2,
  Save,
  Sparkles,
  ClipboardList,
} from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import { LocationSearch } from "@/components/location-search";
import { ChiGauge } from "@/components/chi-gauge";
import { CropChat } from "@/components/crop-chat";
import { MiniMarkdown } from "@/components/mini-markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { cropHealthIndex, recommendations, buildSummary } from "@/lib/crop-science";
import { analyzeImage, type ImageAnalysis } from "@/lib/image-analysis";
import { uploadToCloudinary, saveHistory, cloudinaryConfigured } from "@/lib/history";
import type { Weather, GeoResult } from "@/lib/weather";
import { firebaseConfigured } from "@/lib/firebase";

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}

function Dashboard() {
  const { user } = useAuth();

  const [location, setLocation] = useState<GeoResult | null>(null);
  const [temp, setTemp] = useState(28);
  const [rh, setRh] = useState(55);
  const [soil, setSoil] = useState(50);

  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const greenness = analysis?.greenness ?? null;
  const imagePct = analysis?.pct ?? null;

  // CHI recomputes live from inputs
  const result = useMemo(
    () => cropHealthIndex(temp, rh, soil, greenness),
    [temp, rh, soil, greenness],
  );

  const recs = useMemo(
    () => recommendations(result.category, result.scores, result.vpd, soil, temp, imagePct),
    [result, soil, temp, imagePct],
  );

  const locationName = location?.label ?? "";
  const summary = useMemo(
    () =>
      buildSummary(
        locationName,
        temp,
        rh,
        soil,
        result.vpd,
        result.chi,
        result.category,
        result.scores,
        imagePct,
        greenness,
      ),
    [locationName, temp, rh, soil, result, imagePct, greenness],
  );

  const onLocation = (loc: GeoResult, weather: Weather | null) => {
    setLocation(loc);
    if (weather) {
      setTemp(Math.round(weather.temp * 10) / 10);
      setRh(Math.round(weather.humidity));
      toast.success(`Loaded live weather for ${loc.label}`);
    } else {
      toast.message(`Found ${loc.label}, but weather couldn't load. Enter values manually.`);
    }
    setSaved(false);
  };

  const onUpload = async (file: File) => {
    setAnalyzing(true);
    setSaved(false);
    try {
      const res = await analyzeImage(file);
      setAnalysis(res);
      if (res.pct.veg_cover < 5) {
        toast.warning("Very little vegetation detected — try a closer, greener leaf photo.");
      }
    } catch {
      toast.error("Couldn't analyze that image. Try a different photo.");
    } finally {
      setAnalyzing(false);
    }
  };

  const onSave = async () => {
    if (!user) return;
    if (!firebaseConfigured) {
      toast.error("Firebase not configured — see SETUP.md to enable history.");
      return;
    }
    setSaving(true);
    try {
      let imageUrl: string | null = null;
      if (analysis && cloudinaryConfigured) {
        try {
          imageUrl = await uploadToCloudinary(analysis.overlayUrl);
        } catch {
          toast.warning("Image couldn't upload to Cloudinary — saving results without the leaf thumbnail.");
        }
      } else if (analysis && !cloudinaryConfigured) {
        toast.message("No Cloudinary upload preset set — saving results without the leaf image.");
      }
      await saveHistory({
        userId: user.uid,
        locationName,
        tempC: temp,
        rh,
        soil,
        vpd: result.vpd,
        chi: result.chi,
        category: result.category,
        scores: result.scores,
        imagePct,
        greenness,
        imageUrl,
      });
      setSaved(true);
      toast.success("Saved to your history.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Crop Health Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Search your location, upload a leaf, and get a fused health score with AI advice.
        </p>
      </div>

      {/* ---- top row: location + environment inputs ---- */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wind className="h-4 w-4 text-primary" /> Location &amp; environment
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Farm location</Label>
            <LocationSearch onSelect={onLocation} />
            {location && (
              <p className="text-xs text-muted-foreground">
                📍 {location.label} — weather auto-filled. Adjust below if needed.
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <SliderField
              label="Temp"
              icon={<Thermometer className="h-3.5 w-3.5" />}
              value={temp}
              min={-10}
              max={55}
              step={0.5}
              unit="°C"
              onChange={setTemp}
            />
            <SliderField
              label="Humidity"
              icon={<Droplets className="h-3.5 w-3.5" />}
              value={rh}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={(v) => setRh(Math.round(v))}
            />
            <SliderField
              label="Soil"
              icon={<Sprout className="h-3.5 w-3.5" />}
              value={soil}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={(v) => setSoil(Math.round(v))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---- image analysis ---- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4 text-primary" /> Leaf image analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!analysis ? (
              <UploadDropzone analyzing={analyzing} onUpload={onUpload} />
            ) : (
              <div className="space-y-4">
                <Tabs defaultValue="overlay">
                  <TabsList className="w-full">
                    <TabsTrigger value="overlay" className="flex-1">
                      Stress map
                    </TabsTrigger>
                    <TabsTrigger value="original" className="flex-1">
                      Original
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="overlay">
                    <ImageFrame src={analysis.overlayUrl} alt="Stress overlay" />
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      🟢 healthy · 🟡 mild stress · 🔴 stressed
                    </p>
                  </TabsContent>
                  <TabsContent value="original">
                    <ImageFrame src={analysis.originalUrl} alt="Original leaf" />
                  </TabsContent>
                </Tabs>

                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Healthy" value={`${Math.round(analysis.pct.healthy)}%`} tone="good" />
                  <Stat label="Mild" value={`${Math.round(analysis.pct.mild)}%`} tone="warn" />
                  <Stat label="Stressed" value={`${Math.round(analysis.pct.stressed)}%`} tone="bad" />
                </div>
                {greenness !== null && (
                  <p className="text-center text-xs text-muted-foreground">
                    Mean VARI (NDVI proxy): <span className="font-medium text-foreground">{greenness.toFixed(3)}</span> ·
                    vegetation cover {Math.round(analysis.pct.veg_cover)}%
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setAnalysis(null);
                    setSaved(false);
                  }}
                >
                  <Upload className="mr-2 h-4 w-4" /> Upload a different photo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---- CHI dashboard ---- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> Crop Health Index
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {!analysis && (
              <p className="rounded-lg bg-secondary/60 px-3 py-2 text-center text-xs text-muted-foreground">
                Environment-only score. Upload a leaf to fold greenness into the index.
              </p>
            )}
            <ChiGauge chi={result.chi} category={result.category} />

            <div className="grid grid-cols-3 gap-2">
              <Stat label="VPD" value={`${result.vpd.toFixed(2)}`} sub="kPa" />
              <Stat label="Temp" value={`${temp.toFixed(1)}`} sub="°C" />
              <Stat label="Soil" value={`${soil}`} sub="%" />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Stress breakdown (0 good → 1 stressed)</p>
              {Object.entries(result.scores).map(([k, v]) => (
                <StressBar key={k} label={k} value={v as number} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- recommendations ---- */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-primary" /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2.5">
            {recs.map((r, i) => (
              <li key={i} className="flex gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                <span className="leading-relaxed">
                  <MiniMarkdown text={r} />
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ---- summary + save ---- */}
      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">📋 Summary</CardTitle>
          <Button onClick={onSave} disabled={saving || saved} size="sm">
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saved ? "Saved" : "Save to history"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            {summary.split("\n\n").map((para, i) => (
              <p key={i}>
                <MiniMarkdown text={para} />
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ---- AI chat ---- */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> AgriSpectra Assistant
            <Badge variant="secondary" className="ml-1 font-normal">
              GPT-4o mini
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CropChat
            locationName={locationName}
            tempC={temp}
            rh={rh}
            soil={soil}
            result={result}
            imagePct={imagePct}
            greenness={greenness}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/* ----------------------------- subcomponents ----------------------------- */

function SliderField({
  label,
  icon,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {icon} {label}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
      />
    </div>
  );
}

function UploadDropzone({
  analyzing,
  onUpload,
}: {
  analyzing: boolean;
  onUpload: (f: File) => void;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onUpload(f);
      }}
      className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        drag ? "border-primary bg-secondary/50" : "border-border hover:border-primary/50 hover:bg-secondary/30"
      }`}
    >
      {analyzing ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Analyzing leaf…</p>
        </>
      ) : (
        <>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
            <Upload className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-medium">Drop a leaf photo, or click to browse</p>
            <p className="mt-1 text-xs text-muted-foreground">JPG / PNG · a close-up green leaf works best</p>
          </div>
        </>
      )}
      <input
        type="file"
        accept="image/jpeg,image/png,image/jpg"
        className="hidden"
        disabled={analyzing}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
        }}
      />
    </label>
  );
}

function ImageFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-contain" />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-[oklch(0.5_0.13_150)]"
      : tone === "warn"
        ? "text-[oklch(0.6_0.13_80)]"
        : tone === "bad"
          ? "text-[oklch(0.55_0.2_25)]"
          : "text-foreground";
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${toneClass}`}>
        {value}
        {sub && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{sub}</span>}
      </p>
    </div>
  );
}

function StressBar({ label, value }: { label: string; value: number }) {
  const color =
    value > 0.4 ? "oklch(0.55 0.2 25)" : value > 0.2 ? "oklch(0.65 0.13 80)" : "oklch(0.55 0.13 150)";
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 text-xs font-medium uppercase text-muted-foreground">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{value.toFixed(2)}</span>
    </div>
  );
}
