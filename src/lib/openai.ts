/* eslint-disable @typescript-eslint/no-explicit-any */
import { fixMojibake } from "./encoding";

const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

if (!KEY) throw new Error("OPENAI_API_KEY not set");

function extractOutputText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text) {
    return data.output_text;
  }

  const chunks: string[] = [];
  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (item?.type !== "message" || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (part?.type === "output_text" && typeof part.text === "string") {
          chunks.push(part.text);
        }
      }
    }
  }

  return chunks.join("").trim();
}

export async function askOpenAI(prompt: string) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("OpenAI error", {
      status: res.status,
      statusText: res.statusText,
      body: txt,
    });
    throw new Error(`OpenAI error: ${res.status} ${txt}`);
  }

  const data = await res.json();
  const raw =
    extractOutputText(data) ||
    "Уучлаарай, систем түр алдаатай байна.";
  return fixMojibake(raw);
}
