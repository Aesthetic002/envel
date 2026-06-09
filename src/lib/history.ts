/**
 * History persistence:
 *  - image bytes  -> Cloudinary (unsigned upload, returns hosted URL)
 *  - metadata     -> Firestore  (per-user collection)
 */
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { ImageStress, StressScores } from "./crop-science";
import type { DiagnosisSummary } from "./diagnosis";

export interface HistoryRecord {
  id: string;
  userId: string;
  locationName: string;
  tempC: number;
  rh: number;
  soil: number;
  vpd: number;
  chi: number;
  category: string;
  scores: StressScores;
  imagePct: ImageStress | null;
  greenness: number | null;
  imageUrl: string | null; // Cloudinary URL
  diagnosis: DiagnosisSummary | null; // probable disease, if diagnosed
  createdAt: Date;
}

const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export const cloudinaryConfigured = Boolean(cloudName && uploadPreset);

/** Upload a data URL (overlay/original) to Cloudinary, return the secure URL. */
export async function uploadToCloudinary(dataUrl: string): Promise<string> {
  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary is not configured.");
  }
  const form = new FormData();
  form.append("file", dataUrl);
  form.append("upload_preset", uploadPreset);

  const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Cloudinary upload failed: ${txt}`);
  }
  const json = await resp.json();
  return json.secure_url as string;
}

export async function saveHistory(
  record: Omit<HistoryRecord, "id" | "createdAt">,
): Promise<void> {
  if (!db) throw new Error("Firestore is not configured.");
  await addDoc(collection(db, "history"), {
    ...record,
    createdAt: serverTimestamp(),
  });
}

export async function fetchHistory(userId: string): Promise<HistoryRecord[]> {
  if (!db) return [];
  // Filter by user in the query (single-field index, always available), then
  // sort newest-first on the client. This avoids needing a Firestore composite
  // index for (userId + createdAt) — simpler for a per-user history list.
  const q = query(collection(db, "history"), where("userId", "==", userId));
  const snap = await getDocs(q);
  const records = snap.docs.map((d) => {
    const data = d.data();
    const ts = data.createdAt as Timestamp | null;
    return {
      id: d.id,
      ...data,
      createdAt: ts ? ts.toDate() : new Date(),
    } as HistoryRecord;
  });
  return records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function deleteHistory(id: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, "history", id));
}
