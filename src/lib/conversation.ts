/* eslint-disable @typescript-eslint/no-explicit-any */
export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  text: string;
};

type ChatSession = {
  messages: ChatMessage[];
  updatedAt: number;
};

const STORE = new Map<string, ChatSession>();
const MAX_MESSAGES = 12;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [key, session] of STORE.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) STORE.delete(key);
  }
}

export function getHistory(id: string): ChatMessage[] {
  prune();
  return STORE.get(id)?.messages || [];
}

export function appendMessage(id: string, role: ChatRole, text: string) {
  prune();
  const session = STORE.get(id) || { messages: [], updatedAt: Date.now() };
  session.messages.push({ role, text });

  if (session.messages.length > MAX_MESSAGES) {
    session.messages = session.messages.slice(-MAX_MESSAGES);
  }

  session.updatedAt = Date.now();
  STORE.set(id, session);
}

export function buildPrompt(options: {
  systemPrompt: string;
  business: {
    name?: string;
    knowledgeBase?: any; // now supports context object
  };
  history: ChatMessage[];
  userText: string;
}) {
  const { systemPrompt, business, history, userText } = options;
  const lines: string[] = [];

  // 🔥 limit history (important)
  const recentHistory = history.slice(-6);

  lines.push(systemPrompt.trim());
  lines.push("");

  lines.push("Reply rules:");
  lines.push("- Answer in Mongolian.");
  lines.push("- Keep replies short (1-2 sentences).");
  lines.push("- Use only the provided context.");
  lines.push("- Do not guess missing information.");
  lines.push("- If unsure, say you will connect to a human.");

  lines.push("- Always guide the user toward a suitable program.");
  lines.push(
    "- If the user is unsure, recommend the Standard Program (12 months, 5,500,000₮) as the default option.",
  );

  lines.push(
    "- If the user asks about full program, prioritize the Standard Program before mentioning others.",
  );

  lines.push(
    "- If the user mentions money problems, suggest the cheapest module first (e.g., 599,999₮ IELTS course).",
  );
  lines.push(
    "- Do not suggest expensive programs when the user shows budget concern.",
  );

  lines.push(
    "- When answering about programs, include name, duration, and price clearly.",
  );

  lines.push("- Do not guarantee scholarship success under any circumstances.");

  lines.push(
    "- Only ask for name and phone number when the user shows clear intent to join.",
  );
  lines.push("- Do not repeatedly ask for contact information.");

  lines.push(
    "- If the question is unclear, ask one short clarifying question.",
  );
  lines.push("- Do not repeat the same phrase in every response.");
  lines.push(
    "- Do not ask for contact information unless the user clearly wants to join.",
  );
  lines.push(
    "- If the user input is unclear or random, guide them instead of trying to sell.",
  );
  lines.push(
    "- When answering sensitive questions (like scholarship), answer first, then optionally suggest a program.",
  );

  lines.push("");
  lines.push(`Business name: ${business?.name || "N/A"}`);

  lines.push("Context:");

  // 🔥 supports BOTH string or object (safe)
  if (typeof business?.knowledgeBase === "string") {
    lines.push(business.knowledgeBase);
  } else {
    lines.push(JSON.stringify(business?.knowledgeBase || {}));
  }

  lines.push("");

  if (recentHistory.length) {
    lines.push("Conversation so far:");
    for (const message of recentHistory) {
      const role = message.role === "user" ? "User" : "Assistant";
      lines.push(`${role}: ${message.text}`);
    }
    lines.push("");
  }

  lines.push(`User: ${userText}`);
  lines.push("Assistant:");

  return lines.join("\n");
}
