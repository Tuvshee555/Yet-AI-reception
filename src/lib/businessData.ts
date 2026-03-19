import { promises as fs } from "fs";
import path from "path";

export type ProgramPrice = number | "NEEDS_MANUAL_FIX";

export type Program = {
  name: string;
  duration: string;
  price: ProgramPrice;
  target: string;
  description: string;
};

export type FAQItem = {
  question: string;
  answer: string;
};

export type KnowledgeData = {
  programs: Program[];
  faq: FAQItem[];
  conflicts_found: string[];
};

export type ProgramsData = Pick<KnowledgeData, "programs" | "conflicts_found">;

export type FAQData = Pick<KnowledgeData, "faq">;

export type RulesData = {
  rules: string[];
};

export type PromptBusinessData = {
  name: string;
  knowledgeBase: string;
  rules: string[];
};

export type BusinessDataFile = {
  systemPrompt: string;
  business: PromptBusinessData;
  knowledge: KnowledgeData;
};

const KNOWLEDGE_PATH = path.join(process.cwd(), "data", "business.json");
const RULES_PATH = path.join(process.cwd(), "data", "rules.json");
const BUSINESS_NAME = "YETI Educational Academy";
const DEFAULT_SYSTEM_PROMPT =
  "You are the official AI receptionist for YETI Educational Academy. Reply in clear Mongolian. Use only the approved knowledge base. Never guess, never use contract-only or internal-only information, and never promise scholarships unless the knowledge base says so.";
const DEFAULT_KNOWLEDGE: KnowledgeData = {
  programs: [],
  faq: [],
  conflicts_found: [],
};
const DEFAULT_RULES: RulesData = {
  rules: [
    "Only answer from the approved YETI Educational Academy data.",
    "Do not mention contracts, internal operations, bank accounts, or internal-only files.",
    "If a value is missing or marked NEEDS_MANUAL_FIX, say the information is not final and offer human help.",
    "Do not guarantee scholarship approval.",
    "Keep replies short, clear, and in Mongolian.",
  ],
};

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatPrice(price: ProgramPrice) {
  return typeof price === "number" ? String(price) : price;
}

function formatKnowledgeBase(data: KnowledgeData) {
  const lines: string[] = [];

  lines.push("Approved programs:");
  for (const program of data.programs) {
    lines.push(
      `- ${program.name} | duration: ${program.duration} | price: ${formatPrice(program.price)} | target: ${program.target} | description: ${program.description}`,
    );
  }

  lines.push("");
  lines.push("Approved FAQ:");
  for (const item of data.faq) {
    lines.push(`- Q: ${item.question}`);
    lines.push(`  A: ${item.answer}`);
  }

  if (data.conflicts_found.length) {
    lines.push("");
    lines.push("Known conflicts or values that need caution:");
    for (const conflict of data.conflicts_found) {
      lines.push(`- ${conflict}`);
    }
  }

  return lines.join("\n");
}

export async function readKnowledgeData(): Promise<KnowledgeData> {
  return readJsonFile(KNOWLEDGE_PATH, DEFAULT_KNOWLEDGE);
}

export async function readPrograms(): Promise<ProgramsData> {
  const knowledge = await readKnowledgeData();
  return {
    programs: knowledge.programs,
    conflicts_found: knowledge.conflicts_found,
  };
}

export async function readFAQ(): Promise<FAQData> {
  const knowledge = await readKnowledgeData();
  return {
    faq: knowledge.faq,
  };
}

export async function readRules(): Promise<RulesData> {
  return readJsonFile(RULES_PATH, DEFAULT_RULES);
}

export async function readBusinessData(): Promise<BusinessDataFile> {
  const knowledge = await readKnowledgeData();
  const rules = await readRules();

  return {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    business: {
      name: BUSINESS_NAME,
      knowledgeBase: formatKnowledgeBase(knowledge),
      rules: rules.rules,
    },
    knowledge,
  };
}

export async function buildContext(intent: string) {
  const data = await readKnowledgeData();

  if (intent === "price" || intent === "program" || intent === "duration") {
    return {
      programs: data.programs,
      conflicts_found: data.conflicts_found,
    };
  }

  if (intent === "faq" || intent === "scholarship" || intent === "contact") {
    return {
      faq: data.faq,
      conflicts_found: data.conflicts_found,
    };
  }

  return data;
}

export function detectIntent(message: string): string {
  const m = message.toLowerCase();

  if (
    m.includes("үнэ") ||
    m.includes("төлбөр") ||
    m.includes("price") ||
    m.includes("cost")
  ) {
    return "price";
  }

  if (
    m.includes("хугацаа") ||
    m.includes("сар") ||
    m.includes("duration") ||
    m.includes("how long")
  ) {
    return "duration";
  }

  if (
    m.includes("ielts") ||
    m.includes("toefl") ||
    m.includes("хөтөлбөр") ||
    m.includes("program")
  ) {
    return "program";
  }

  if (
    m.includes("тэтгэлэг") ||
    m.includes("visa") ||
    m.includes("essay") ||
    m.includes("document") ||
    m.includes("scholarship")
  ) {
    return "scholarship";
  }

  if (
    m.includes("утас") ||
    m.includes("хаяг") ||
    m.includes("facebook") ||
    m.includes("байршил") ||
    m.includes("contact")
  ) {
    return "contact";
  }

  return "general";
}
