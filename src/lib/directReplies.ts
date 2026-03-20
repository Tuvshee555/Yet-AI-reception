import type { KnowledgeData, SpecialOffer } from "./businessData";
import type { ChatMessage } from "./conversation";

type StudentInfo = {
  grade?: number;
  age?: number;
};

type PricingOptions = {
  bundle: boolean;
  discountEligible: boolean;
};

const HIGH_SCHOOL_PRICE_PATTERNS = [
  /1\s*[.,]?\s*500\s*[.,]?\s*000/,
  /\b1500000\b/,
];

const HIGH_SCHOOL_PROGRAM_PATTERNS = [
  /ахлах.*(?:сургалт|хөтөлбөр|program|offer|join|элс)/,
  /(?:сургалт|хөтөлбөр|program|offer).*(?:ахлах|9-12|16\+)/,
  /(?:9|10|11|12)\s*-?р\s*анг(?:и|ийн|ид).*(?:сургалт|хөтөлбөр|program|offer)/,
];

const GRADE_PATTERNS = [
  /(7|8|9|10|11|12)\s*-?р\s*анг(?:и|ийн|ид|ийн\s*сурагч|ийн\s*хүүхэд)/,
  /\b(7|8|9|10|11|12)\s*(?:th)?\s*grade\b/,
  /\bgrade\s*(7|8|9|10|11|12)\b/,
  /\bclass\s*(7|8|9|10|11|12)\b/,
  /\b(7|8|9|10|11|12)\s*angi\b/,
];

const AGE_PATTERNS = [
  /(?:^|[^\d])(1[0-9]|2[0-4])\s*настай(?:\s|[.,!?]|$)/,
  /\b(1[0-9]|2[0-4])\s*(?:years?\s*old|yrs?\s*old|yo)\b/,
  /\bage\s*(1[0-9]|2[0-4])\b/,
  /\b(1[0-9]|2[0-4])\s*nas\b/,
];

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractNumber(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }

  return undefined;
}

function collectStudentInfo(history: ChatMessage[], userText: string): StudentInfo {
  const recentUserTexts = history
    .filter((message) => message.role === "user")
    .slice(-2)
    .reverse()
    .map((message) => message.text);
  const texts = [userText, ...recentUserTexts];
  const info: StudentInfo = {};

  for (const text of texts) {
    const normalized = normalize(text);

    if (info.grade === undefined) {
      info.grade = extractNumber(normalized, GRADE_PATTERNS);
    }

    if (info.age === undefined) {
      info.age = extractNumber(normalized, AGE_PATTERNS);
    }

    if (info.grade !== undefined && info.age !== undefined) {
      break;
    }
  }

  return info;
}

function isHighSchoolOfferQuery(text: string) {
  const normalized = normalize(text);
  return (
    HIGH_SCHOOL_PRICE_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    HIGH_SCHOOL_PROGRAM_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function findHighSchoolOffer(knowledge: KnowledgeData): SpecialOffer | undefined {
  return knowledge.special_offers.find(
    (offer) => offer.price === 1500000 || offer.name.includes("Ахлах анги"),
  );
}

function formatCurrency(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value)}₮`;
}

function calculateFinalPrice(basePrice: number, options: PricingOptions) {
  let price = basePrice;

  if (options.bundle) {
    price = 350000;
  }

  if (options.discountEligible) {
    price = price * 0.5;
  }

  return price;
}

function isCertificateOrGuaranteeQuestion(text: string) {
  return /certificate|certify|guarantee|admission|authorized|representative|сертификат|гэрчилгээ|баталгаа|батал|элсэлт|тэнцүүлэх|зөвшөөрөл/.test(
    text,
  );
}

function isFaqOrFactualQuestion(text: string) {
  const factualKeywords =
    /issued|issue\s*date|valid|address|phone|facebook|location|date|огноо|утас|хаяг|байршил|сертификат|гэрчилгээ/;
  const directOfferKeywords =
    /price|cost|үнэ|төлбөр|program|offer|join|сургалт|хөтөлбөр|элс|англи|мат/;

  return factualKeywords.test(text) && !directOfferKeywords.test(text);
}

function isEnglishMathPricingQuery(text: string) {
  const hasEnglish = /english|англи|angli/.test(text);
  const hasMath = /math|mathematics|мат(?:ематик)?|\bmat\b/.test(text);
  return hasEnglish || hasMath;
}

function isDiscountEligible(text: string) {
  return /volunteer|сайн\s*дур|sain\s*dur|sport|sports|спорт|blood|цус|trash|хог|community|өмнө\s*нь\s*(?:yeti|манайд)|umnu\s*ni|previously\s*studied|studied\s*before/.test(
    text,
  );
}

function buildPricingReply(text: string) {
  const hasEnglish = /english|англи|angli/.test(text);
  const hasMath = /math|mathematics|мат(?:ематик)?|\bmat\b/.test(text);
  const bundle = hasEnglish && hasMath;
  const discountEligible = isDiscountEligible(text);

  if (!hasEnglish && !hasMath) return null;

  const basePrice = bundle ? 400000 : 200000;
  const finalPrice = calculateFinalPrice(basePrice, {
    bundle,
    discountEligible,
  });

  if (bundle && discountEligible) {
    return `Англи хэл ба математикийг хамт авбал багц үнэ 350,000₮, 50%-ийн хөнгөлөлттэй бол эцсийн үнэ ${formatCurrency(finalPrice)} байна.`;
  }

  if (bundle) {
    return "Англи хэл 200,000₮, математик 200,000₮, хоёуланг нь хамт авбал багц үнэ 350,000₮ байна.";
  }

  if (discountEligible) {
    return `${hasEnglish ? "Англи хэл" : "Математик"} дангаар 200,000₮, 50%-ийн хөнгөлөлттэй бол эцсийн үнэ ${formatCurrency(finalPrice)} байна.`;
  }

  return `${hasEnglish ? "Англи хэл" : "Математик"} дангаар 200,000₮ байна.`;
}

export function maybeGetDirectReply(options: {
  userText: string;
  history: ChatMessage[];
  knowledge: KnowledgeData;
}) {
  const { userText, history, knowledge } = options;
  const normalizedText = normalize(userText);

  if (isFaqOrFactualQuestion(normalizedText)) return null;
  if (isCertificateOrGuaranteeQuestion(normalizedText)) return null;

  const pricingReply = isEnglishMathPricingQuery(normalizedText)
    ? buildPricingReply(normalizedText)
    : null;
  if (pricingReply) return pricingReply;

  if (!isHighSchoolOfferQuery(normalizedText)) return null;

  const offer = findHighSchoolOffer(knowledge);
  if (!offer || typeof offer.price !== "number") return null;

  const offerLabel = `${formatCurrency(offer.price)}-ийн ${offer.name}`;
  const info = collectStudentInfo(history, userText);

  if (info.grade !== undefined) {
    if (info.grade <= 8) {
      return `${offerLabel} нь зөвхөн 9-12-р ангийн сурагчдад зориулагдсан тул 8-р анги болон түүнээс доош ангид санал болгохгүй.`;
    }

    return null;
  }

  if (info.age !== undefined) {
    if (info.age < 16) {
      return `${offerLabel} нь зөвхөн 16+ насны ахлах ангийн сурагчдад зориулагдсан тул 16-аас доош насанд санал болгохгүй.`;
    }

    return null;
  }

  return `${offerLabel} нь зөвхөн ахлах ангийн 9-12-р анги буюу 16+ сурагчдад зориулагдсан. Та хэддүгээр анги эсвэл хэдэн настай вэ?`;
}
