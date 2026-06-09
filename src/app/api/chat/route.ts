import OpenAI from "openai";
import type { NextRequest } from "next/server";

interface ChatContext {
  locationName: string;
  tempC: number;
  rh: number;
  soil: number;
  vpd: number;
  chi: number;
  category: string;
  scores: { soil: number; vpd: number; temp: number; green?: number };
  imageInfo: string;
  diagnosisInfo?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function buildSystemPrompt(ctx: ChatContext): string {
  const greenLine = ctx.scores.green !== undefined ? `, green=${ctx.scores.green.toFixed(2)}` : "";
  return `You are AgriSpectra's crop health assistant — think of yourself as a knowledgeable but chill farming buddy. You're upbeat, a little fun, and straight to the point.

PERSONALISATION RULES (critical):
- You already know the user's farm data below — use it naturally in every reply
- Always refer to their actual numbers, not generic advice (e.g. "your soil is at ${ctx.soil}%" not "soil moisture matters")
- Reference their location (${ctx.locationName || "their area"}) when giving weather or seasonal context
- Acknowledge their specific CHI of ${ctx.chi}/100 — don't speak in vague terms
- Make the user feel like you're talking about THEIR farm, not a textbook example
- If they ask a general question, still tie the answer back to their current readings

RESPONSE RULES (always follow these):
- Reply in bullet points by default — no long paragraphs
- Each bullet = one clear action or fact, max 1 line
- Lead with the most important point first
- Use plain farmer-friendly language, no jargon dumps
- Add a relevant emoji per bullet to make it scannable (💧🌡️🌱 etc.)
- If everything is fine, keep it short and positive — don't pad
- Only go beyond 5 bullets if the user explicitly asks for more detail
- Never make up data — only refer to the values below
- If a disease diagnosis is present below, treat it as the most important context: tie your advice to that diagnosis and its treatment plan, and stay consistent with it (don't contradict it)

Current farm data:
- Location: ${ctx.locationName || "unknown"}
- Temperature: ${ctx.tempC.toFixed(1)}°C
- Relative humidity: ${ctx.rh}%
- Soil moisture: ${ctx.soil}%
- VPD: ${ctx.vpd.toFixed(2)} kPa
- Crop Health Index (CHI): ${ctx.chi}/100 — ${ctx.category}
- Stress scores (0=good, 1=bad): soil=${ctx.scores.soil.toFixed(2)}, vpd=${ctx.scores.vpd.toFixed(2)}, temp=${ctx.scores.temp.toFixed(2)}${greenLine}
- ${ctx.imageInfo}

Disease diagnosis:
- ${ctx.diagnosisInfo || "No disease diagnosis has been run yet."}`;
}

export async function POST(request: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return Response.json(
      { error: "GITHUB_TOKEN is not set on the server. Add it to .env.local and restart." },
      { status: 500 },
    );
  }

  let body: { context: ChatContext; messages: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const client = new OpenAI({
    baseURL: "https://models.inference.ai.azure.com",
    apiKey: token,
  });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: buildSystemPrompt(body.context) },
        ...body.messages,
      ],
      max_tokens: 350,
      temperature: 0.4,
    });
    const reply = completion.choices[0]?.message?.content ?? "(no response)";
    return Response.json({ reply });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: `Could not reach GitHub Models: ${msg}` }, { status: 502 });
  }
}
