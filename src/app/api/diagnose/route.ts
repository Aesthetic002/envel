import OpenAI from "openai";
import type { NextRequest } from "next/server";
import type { Diagnosis } from "@/lib/diagnosis";

/**
 * Vision-based leaf disease diagnosis via GitHub Models (GPT-4o).
 * Receives the leaf image + the current stress context, returns a structured
 * Diagnosis. Diagnosis is probabilistic decision-support, NOT a verdict — the
 * prompt is explicit about uncertainty and the response always carries a caveat.
 */

interface DiagnoseContext {
  cropHint?: string; // optional crop name the user may provide
  tempC: number;
  rh: number;
  soil: number;
  vpd: number;
  chi: number;
  category: string;
  greenness: number | null;
  stressedPct: number; // % of leaf area flagged stressed by VARI
  mildPct: number;
}

interface DiagnoseBody {
  image: string; // data URL (jpeg/png)
  context: DiagnoseContext;
}

const SYSTEM_PROMPT = `You are a plant pathologist assisting a farmer. You will be given a photo of a crop leaf/canopy plus environmental readings. Your job is to give a careful, scientifically-grounded probable diagnosis and a full treatment plan.

CRITICAL RULES:
- This is decision-support from a SINGLE photo, never a definitive verdict. Be honest about uncertainty.
- Cross-reference the IMAGE with the ENVIRONMENTAL DATA. Many "diseases" are actually abiotic stress (drought, heat, nutrient deficiency). E.g. uniform yellowing + low soil moisture often means water/nutrient stress, NOT infection. Lesions/spots/mosaic/powder patterns suggest pathogens.
- If the leaf looks healthy, say so (probableDisease: "Healthy") and do not invent a problem.
- If the image is too ambiguous/blurry/unlit to judge, set probableDisease to "Inconclusive" and confidence "Low", and explain what a clearer photo would need.
- Set confidence honestly: "High" only for textbook-clear symptoms; "Medium" for probable; "Low" for guesses or abiotic-vs-biotic ambiguity.
- Treatment must be SPECIFIC and scientific: real irrigation adjustments, actual soil compounds (and what to AVOID), fertiliser TYPE + NPK ratio + approximate dosage (per plant or per hectare), a named chemical control AND an organic/cultural alternative, and prevention.
- Never recommend a dangerous dose. Keep advice within standard agronomic ranges.
- The caveat must remind the user this is a probable diagnosis from one photo and to confirm with a local agronomist/lab before applying chemicals.

Respond with ONLY a JSON object (no markdown fences) with exactly these keys:
{
  "probableDisease": string,
  "confidence": "High" | "Medium" | "Low",
  "severity": "None" | "Mild" | "Moderate" | "Severe",
  "summary": string,
  "alsoConsider": string[],
  "irrigation": string,
  "soil": string,
  "fertiliser": string,
  "treatment": string,
  "prevention": string,
  "caveat": string
}`;

function buildUserText(ctx: DiagnoseContext): string {
  return `Crop: ${ctx.cropHint || "unknown (infer if possible)"}
Environmental readings:
- Temperature: ${ctx.tempC.toFixed(1)}°C
- Relative humidity: ${ctx.rh}%
- Soil moisture: ${ctx.soil}%
- VPD: ${ctx.vpd.toFixed(2)} kPa
- Crop Health Index: ${ctx.chi}/100 (${ctx.category})
- Mean leaf greenness (VARI proxy): ${ctx.greenness !== null ? ctx.greenness.toFixed(3) : "n/a"}
- Image analysis flagged ${ctx.stressedPct.toFixed(0)}% of leaf area as stressed and ${ctx.mildPct.toFixed(0)}% as mildly stressed.

Diagnose the probable disease/disorder and give the full treatment plan as specified.`;
}

export async function POST(request: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return Response.json(
      { error: "GITHUB_TOKEN is not set on the server. Add it to .env.local and restart." },
      { status: 500 },
    );
  }

  let body: DiagnoseBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.image || !body.image.startsWith("data:image")) {
    return Response.json({ error: "A leaf image is required for diagnosis." }, { status: 400 });
  }

  const client = new OpenAI({
    baseURL: "https://models.inference.ai.azure.com",
    apiKey: token,
  });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildUserText(body.context) },
            { type: "image_url", image_url: { url: body.image, detail: "low" } },
          ],
        },
      ],
      max_tokens: 900,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let parsed: Diagnosis;
    try {
      parsed = JSON.parse(raw) as Diagnosis;
    } catch {
      return Response.json(
        { error: "The model returned an unparseable response. Try again." },
        { status: 502 },
      );
    }

    // guarantee the caveat is always present, even if the model omits it
    if (!parsed.caveat) {
      parsed.caveat =
        "Probable diagnosis from a single photo — confirm with a local agronomist or plant clinic before applying any chemicals.";
    }

    return Response.json({ diagnosis: parsed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: `Diagnosis failed: ${msg}` }, { status: 502 });
  }
}
