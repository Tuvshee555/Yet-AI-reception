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

export type SpecialOffer = Program & {
  eligibility: string;
};

export type DiscountPolicy = {
  name: string;
  discount: string;
  applies_to: string;
  eligibility: string;
  description: string;
  verification: string;
};

export type VerifiedCredential = {
  title: string;
  issuer: string;
  issued_on: string;
  description: string;
};

export type FAQItem = {
  question: string;
  answer: string;
};

export type KnowledgeData = {
  packages: Program[];
  modules: Program[];
  special_offers: SpecialOffer[];
  discount_policies: DiscountPolicy[];
  verified_credentials: VerifiedCredential[];
  faq: FAQItem[];
  conflicts_found: string[];
};

export type ProgramsData = Pick<
  KnowledgeData,
  "packages" | "modules" | "special_offers" | "discount_policies" | "conflicts_found"
>;

export type FAQData = Pick<KnowledgeData, "faq" | "verified_credentials">;

export type PromptBusinessData = {
  name: string;
  knowledgeBase: string;
};

export type BusinessDataFile = {
  systemPrompt: string;
  business: PromptBusinessData;
  knowledge: KnowledgeData;
};

const KNOWLEDGE_PATH = path.join(process.cwd(), "data", "business.json");
const BUSINESS_NAME = "YETI Educational Academy";
const DEFAULT_SYSTEM_PROMPT =
  "You are the official AI receptionist for YETI Educational Academy. Reply in clear Mongolian. Use only the approved knowledge base. Never guess, never use contract-only or internal-only information, and never promise scholarships unless the knowledge base says so.";
const DEFAULT_KNOWLEDGE: KnowledgeData = {
  packages: [],
  modules: [],
  special_offers: [],
  discount_policies: [],
  verified_credentials: [],
  faq: [],
  conflicts_found: [],
};

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function formatPrice(price: ProgramPrice) {
  return typeof price === "number" ? String(price) : price;
}

function formatKnowledgeBase(data: KnowledgeData) {
  const lines: string[] = [];

  lines.push("Packages:");
  for (const program of data.packages) {
    lines.push(
      `- ${program.name} | duration: ${program.duration} | price: ${formatPrice(program.price)} | target: ${program.target} | description: ${program.description}`,
    );
  }

  lines.push("");
  lines.push("Modules:");
  for (const program of data.modules) {
    lines.push(
      `- ${program.name} | duration: ${program.duration} | price: ${formatPrice(program.price)} | target: ${program.target} | description: ${program.description}`,
    );
  }

  lines.push("");
  lines.push("Special offers:");
  for (const offer of data.special_offers) {
    lines.push(
      `- ${offer.name} | duration: ${offer.duration} | price: ${formatPrice(offer.price)} | target: ${offer.target} | description: ${offer.description} | eligibility: ${offer.eligibility}`,
    );
  }

  lines.push("");
  lines.push("Discount policies:");
  for (const policy of data.discount_policies) {
    lines.push(
      `- ${policy.name} | discount: ${policy.discount} | applies to: ${policy.applies_to} | eligibility: ${policy.eligibility} | description: ${policy.description} | verification: ${policy.verification}`,
    );
  }

  lines.push("");
  lines.push("Verified credentials:");
  for (const credential of data.verified_credentials) {
    lines.push(
      `- ${credential.title} | issuer: ${credential.issuer} | issued on: ${credential.issued_on} | description: ${credential.description}`,
    );
  }

  lines.push("");
  lines.push("FAQ:");
  for (const item of data.faq) {
    lines.push(`- Q: ${item.question}`);
    lines.push(`  A: ${item.answer}`);
  }

  return lines.join("\n");
}

export async function readKnowledgeData(): Promise<KnowledgeData> {
  return readJsonFile(KNOWLEDGE_PATH, DEFAULT_KNOWLEDGE);
}

export async function readPrograms(): Promise<ProgramsData> {
  const knowledge = await readKnowledgeData();
  return {
    packages: knowledge.packages,
    modules: knowledge.modules,
    special_offers: knowledge.special_offers,
    discount_policies: knowledge.discount_policies,
    conflicts_found: knowledge.conflicts_found,
  };
}

export async function readFAQ(): Promise<FAQData> {
  const knowledge = await readKnowledgeData();
  return {
    faq: knowledge.faq,
    verified_credentials: knowledge.verified_credentials,
  };
}

export async function readBusinessData(): Promise<BusinessDataFile> {
  const knowledge = await readKnowledgeData();

  return {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    business: {
      name: BUSINESS_NAME,
      knowledgeBase: formatKnowledgeBase(knowledge),
    },
    knowledge,
  };
}

export async function buildContext(intent: string) {
  const data = await readKnowledgeData();

  if (intent === "price") {
    return {
      packages: data.packages,
      modules: data.modules,
      special_offers: data.special_offers,
      discount_policies: data.discount_policies,
    };
  }

  if (intent === "duration") {
    return {
      packages: data.packages,
      modules: data.modules,
      special_offers: data.special_offers,
    };
  }

  if (intent === "program") {
    return {
      packages: data.packages,
      modules: data.modules,
      special_offers: data.special_offers,
      discount_policies: data.discount_policies,
      verified_credentials: data.verified_credentials,
    };
  }

  if (intent === "faq" || intent === "scholarship" || intent === "contact") {
    return {
      faq: data.faq,
      special_offers: data.special_offers,
      discount_policies: data.discount_policies,
      verified_credentials: data.verified_credentials,
    };
  }

  return {
    packages: data.packages,
    modules: data.modules,
    special_offers: data.special_offers,
    discount_policies: data.discount_policies,
    verified_credentials: data.verified_credentials,
    faq: data.faq,
  };
}

export function detectIntent(message: string): string {
  const m = message.toLowerCase();

  if (
    m.includes("үнэ") ||
    m.includes("төлбөр") ||
    m.includes("price") ||
    m.includes("cost") ||
    m.includes("how much")
  ) {
    return "price";
  }

  if (
    m.includes("хугацаа") ||
    m.includes("сар") ||
    m.includes("хэр удаан") ||
    m.includes("duration") ||
    m.includes("how long")
  ) {
    return "duration";
  }

  if (
    m.includes("ielts") ||
    m.includes("toefl") ||
    m.includes("хөтөлбөр") ||
    m.includes("сургалт") ||
    m.includes("суралц") ||
    m.includes("course") ||
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
