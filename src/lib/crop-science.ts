/**
 * Crop science logic — ported 1:1 from the original Python app.
 * Pure functions, no DOM. Safe to run on client or server.
 */

export interface StressScores {
  soil: number;
  vpd: number;
  temp: number;
  green?: number;
}

export interface ImageStress {
  healthy: number;
  mild: number;
  stressed: number;
  veg_cover: number;
}

export interface CropHealthResult {
  chi: number;
  category: "Healthy" | "Moderately Stressed" | "Critically Stressed";
  vpd: number;
  scores: StressScores;
}

/** Tetens equation -> saturation vapor pressure in kPa. */
export function saturationVaporPressure(tempC: number): number {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/** Vapor Pressure Deficit in kPa. Higher = more atmospheric water demand = more stress. */
export function vaporPressureDeficit(tempC: number, rh: number): number {
  return saturationVaporPressure(tempC) * (1 - rh / 100);
}

const clip = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Map a value to 0 (healthy) .. 1 (fully stressed) outside an optimal band. */
export function stressScore(value: number, lowOk: number, highOk: number): number {
  if (value < lowOk) return clip((lowOk - value) / lowOk, 0, 1);
  if (value > highOk) return clip((value - highOk) / highOk, 0, 1);
  return 0;
}

/**
 * Fuse individual stress scores into one 0-100 Crop Health Index.
 * 100 = perfectly healthy, 0 = critically stressed.
 */
export function cropHealthIndex(
  tempC: number,
  rh: number,
  soilMoist: number,
  greenness?: number | null,
): CropHealthResult {
  const vpd = vaporPressureDeficit(tempC, rh);

  const sTemp = stressScore(tempC, 18, 32);
  const sVpd = stressScore(vpd, 0.4, 1.6);
  const sSoil = stressScore(soilMoist, 35, 85);

  let weights: Record<string, number> = { soil: 0.4, vpd: 0.35, temp: 0.25 };
  const scores: StressScores = { soil: sSoil, vpd: sVpd, temp: sTemp };

  if (greenness !== undefined && greenness !== null) {
    const sGreen = clip((0.25 - greenness) / 0.25, 0, 1);
    scores.green = sGreen;
    weights = { soil: 0.3, vpd: 0.28, temp: 0.17, green: 0.25 };
  }

  const totalStress = Object.keys(scores).reduce(
    (acc, k) => acc + weights[k] * (scores[k as keyof StressScores] as number),
    0,
  );
  const chi = Math.round(100 * (1 - totalStress) * 10) / 10;

  const category =
    chi >= 70 ? "Healthy" : chi >= 45 ? "Moderately Stressed" : "Critically Stressed";

  return { chi, category, vpd, scores };
}

export function recommendations(
  category: CropHealthResult["category"],
  scores: StressScores,
  vpd: number,
  soilMoist: number,
  tempC: number,
  imagePct?: ImageStress | null,
): string[] {
  const recs: string[] = [];

  if ((scores.soil ?? 0) > 0.2) {
    recs.push(
      soilMoist < 35
        ? "💧 **Irrigate soon** — soil moisture is below the comfort band; schedule watering today."
        : "💧 Soil moisture trending low — keep irrigation on standby.",
    );
  }
  if ((scores.vpd ?? 0) > 0.2 || vpd > 1.6) {
    recs.push(
      `🌡️ **High atmospheric demand (VPD ${vpd.toFixed(2)} kPa)** — irrigate in cooler hours and consider shade/mulch.`,
    );
  }
  if ((scores.temp ?? 0) > 0.2) {
    if (tempC > 32)
      recs.push("🔥 **Heat stress risk** — avoid mid-day spraying; ensure adequate water before peak heat.");
    else if (tempC < 18)
      recs.push("❄️ Cool conditions slowing growth — hold off on heavy fertilization until it warms.");
  }
  if (imagePct && imagePct.stressed > 20) {
    recs.push(
      `🍂 **${Math.round(imagePct.stressed)}% of leaf area looks stressed** — inspect for pests/disease and consider targeted treatment.`,
    );
  }
  if ((scores.green ?? 0) > 0.3) {
    recs.push("🧪 Low overall greenness — possible nutrient deficiency; a nitrogen check is advisable.");
  }

  if (recs.length === 0) {
    recs.push("✅ Conditions are within healthy bands — maintain current irrigation and monitoring schedule.");
  }
  if (category === "Critically Stressed") {
    recs.unshift("🚨 **Critical:** multiple stress factors overlap — act within 24h to avoid irreversible yield loss.");
  }
  return recs;
}

export function buildSummary(
  locationName: string,
  tempC: number,
  rh: number,
  soil: number,
  vpd: number,
  chi: number,
  category: CropHealthResult["category"],
  scores: StressScores,
  imagePct?: ImageStress | null,
  greenness?: number | null,
): string {
  const lines: string[] = [];
  const locStr = locationName ? `at **${locationName}**` : "";

  lines.push(
    `The current environment ${locStr} shows a temperature of **${tempC.toFixed(1)}°C** with **${rh}% relative humidity**, giving a Vapor Pressure Deficit of **${vpd.toFixed(2)} kPa**. Soil moisture is set at **${soil}%**.`,
  );

  lines.push(`Overall, the **Crop Health Index is ${chi}/100** — classified as **${category}**.`);

  const notes: string[] = [];
  if ((scores.soil ?? 0) > 0.2) notes.push("soil moisture is outside the ideal range");
  if ((scores.vpd ?? 0) > 0.2) notes.push(`atmospheric water demand (VPD) is elevated at ${vpd.toFixed(2)} kPa`);
  if ((scores.temp ?? 0) > 0.2) notes.push(`temperature (${tempC.toFixed(1)}°C) is outside the crop comfort band (18–32°C)`);
  if ((scores.green ?? 0) > 0.3) notes.push("leaf greenness is below healthy levels");

  lines.push(
    notes.length ? "Key stress drivers: " + notes.join("; ") + "." : "No individual stress factor is significantly elevated.",
  );

  if (imagePct && greenness !== undefined && greenness !== null) {
    lines.push(
      `The uploaded leaf image shows **${Math.round(imagePct.healthy)}% healthy area**, **${Math.round(imagePct.mild)}% mildly stressed**, and **${Math.round(imagePct.stressed)}% stressed** (out of ${Math.round(imagePct.veg_cover)}% vegetation cover). Mean VARI (greenness proxy) is **${greenness.toFixed(3)}**.`,
    );
  } else {
    lines.push("No leaf image was uploaded — the index is based on environmental data only.");
  }

  if (category === "Healthy")
    lines.push("**Bottom line:** Conditions look good. Maintain your current schedule and keep monitoring.");
  else if (category === "Moderately Stressed")
    lines.push("**Bottom line:** Moderate stress detected. Review the recommendations and adjust irrigation or shading as needed.");
  else lines.push("**Bottom line:** Critical stress conditions — immediate action is needed to protect the crop.");

  return lines.join("\n\n");
}
