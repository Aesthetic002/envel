/**
 * Image analysis — VARI vegetation index + color-coded stress overlay.
 * Ported from the Python NumPy version to the browser Canvas API.
 *
 * VARI = (G - R) / (G + R - B)   (a visible-band NDVI proxy)
 * Runs entirely client-side. Returns the overlay as a data URL + stats.
 */

import type { ImageStress } from "./crop-science";

export interface ImageAnalysis {
  overlayUrl: string; // data URL of the color-coded stress map
  originalUrl: string; // data URL of the original (normalized) image
  pct: ImageStress;
  greenness: number | null; // mean VARI over vegetation pixels
}

/** Downscale large images so analysis stays fast and memory-light. */
const MAX_DIM = 900;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export async function analyzeImage(file: File): Promise<ImageAnalysis> {
  const img = await loadImage(file);

  let { width, height } = img;
  if (Math.max(width, height) > MAX_DIM) {
    const scale = MAX_DIM / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const overlay = ctx.createImageData(width, height);
  const odata = overlay.data;

  let totalVeg = 0;
  let healthyCount = 0;
  let mildCount = 0;
  let stressedCount = 0;
  let variSum = 0;

  const totalPixels = width * height;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    let denom = g + r - b;
    if (Math.abs(denom) < 1e-6) denom = 1e-6;
    let vari = (g - r) / denom;
    vari = Math.min(Math.max(vari, -1), 1);

    // vegetation when green dominates
    const isVeg = g > r && g > b * 0.9;

    // start overlay as a dimmed copy of original
    let or = data[i];
    let og = data[i + 1];
    let ob = data[i + 2];

    if (isVeg) {
      totalVeg++;
      variSum += vari;

      let tint: [number, number, number];
      if (vari >= 0.15) {
        healthyCount++;
        tint = [40, 200, 70];
      } else if (vari >= 0.02) {
        mildCount++;
        tint = [240, 210, 50];
      } else {
        stressedCount++;
        tint = [220, 50, 40];
      }
      or = 0.4 * or + 0.6 * tint[0];
      og = 0.4 * og + 0.6 * tint[1];
      ob = 0.4 * ob + 0.6 * tint[2];
    }

    odata[i] = or;
    odata[i + 1] = og;
    odata[i + 2] = ob;
    odata[i + 3] = 255;
  }

  // original (normalized) data URL
  const originalUrl = canvas.toDataURL("image/jpeg", 0.85);

  // overlay data URL
  ctx.putImageData(overlay, 0, 0);
  const overlayUrl = canvas.toDataURL("image/jpeg", 0.85);

  let pct: ImageStress;
  let greenness: number | null;
  if (totalVeg === 0) {
    pct = { healthy: 0, mild: 0, stressed: 0, veg_cover: 0 };
    greenness = null;
  } else {
    pct = {
      healthy: (100 * healthyCount) / totalVeg,
      mild: (100 * mildCount) / totalVeg,
      stressed: (100 * stressedCount) / totalVeg,
      veg_cover: (100 * totalVeg) / totalPixels,
    };
    greenness = variSum / totalVeg;
  }

  return { overlayUrl, originalUrl, pct, greenness };
}
