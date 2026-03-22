import { fixMojibake } from "./encoding";

const KEY = process.env.GEMINI_API_KEY;

if (!KEY) throw new Error("GEMINI_API_KEY not set");

export async function askGemini(prompt: string) {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    },
  );

  if (!res.ok) {
    const txt = await res.text();
    console.error("Gemini error", {
      status: res.status,
      statusText: res.statusText,
      body: txt,
    });
    throw new Error(`Gemini error: ${res.status} ${txt}`);
  }

  const data = await res.json();
  const raw =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "Уучлаарай, систем түр алдаатай байна.";
  return fixMojibake(raw);
}
