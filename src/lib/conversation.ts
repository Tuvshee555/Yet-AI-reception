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
    knowledgeBase?: string;
    rules?: string[];
  };
  history: ChatMessage[];
  userText: string;
}) {
  const { systemPrompt, business, history, userText } = options;
  const lines: string[] = [];

  lines.push(systemPrompt.trim());
  lines.push("");
  lines.push("Reply rules:");
  lines.push("- Answer in Mongolian.");
  lines.push("- Keep replies short and clear, usually 1-3 sentences.");
  lines.push("- Use only the approved knowledge base below.");
  lines.push("- Never guess or invent missing facts, prices, durations, deadlines, or contacts.");
  lines.push("- Do not use contracts, internal operations, bank details, or marketing-only claims.");
  lines.push("- If a value is missing or marked NEEDS_MANUAL_FIX, say: \"Энэ мэдээлэл одоогоор тодорхойгүй байна. Хүний ажилтантай холбож өгье.\"");
  lines.push("- If the user asks about programs, include exact name, duration, and price when available.");
  lines.push("- Do not promise that a student will definitely receive a scholarship.");
  lines.push("- If the user wants to register, collect name, phone number, and the program they are interested in.");
  lines.push("- If the user only greets you, reply with one short greeting and offer help.");
  lines.push("- Ask at most one follow-up question.");

  if (business.rules?.length) {
    lines.push("");
    lines.push("Approved business rules:");
    for (const rule of business.rules) {
      lines.push(`- ${rule}`);
    }
  }

  lines.push("");
  lines.push(`Business name: ${business?.name || "N/A"}`);
  lines.push("Approved knowledge base:");
  lines.push(business?.knowledgeBase || "N/A");
  lines.push("");

  if (history.length) {
    lines.push("Conversation so far:");
    for (const message of history) {
      const role = message.role === "user" ? "User" : "Assistant";
      lines.push(`${role}: ${message.text}`);
    }
    lines.push("");
  }

  lines.push(`User: ${userText}`);
  lines.push("Assistant:");
  return lines.join("\n");
}
