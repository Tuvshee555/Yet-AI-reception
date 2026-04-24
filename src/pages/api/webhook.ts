import type { NextApiRequest, NextApiResponse } from "next";
import { askOpenAI } from "../../lib/openai";
import { sendTextMessage, sendTypingOn } from "../../lib/messenger";
import { sendTextMessage as sendIgTextMessage } from "../../lib/instagram";
import { detectIntent, readBusinessData } from "../../lib/businessData";
import { appendMessage, buildPrompt, getHistory } from "../../lib/conversation";
import { maybeGetDirectReply } from "../../lib/directReplies";
import { fixMojibake } from "../../lib/encoding";
import { isDuplicateReply, sanitizeAssistantReply } from "../../lib/reply";
import { trackMessageUsage } from "../../lib/usageTracker";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ID = "601173946571365";
const FACEBOOK_TOKEN = process.env.TOKEN_PAGE!;
const FALLBACK_SEND_ERROR_MESSAGE = "Уучлаарай, мессеж илгээхэд алдаа гарлаа.";

type Platform = "facebook" | "instagram";

const PROCESSED_EVENT_TTL_MS = 2 * 60 * 1000;
const RECENT_TEXT_TTL_MS = 20 * 1000;
const processedEvents = new Map<string, number>();
const activeConversations = new Set<string>();
const recentIncomingTexts = new Map<string, number>();
const recentReplies = new Map<string, { text: string; timestamp: number }>();

function verifyToken(token: unknown) {
  return token === VERIFY_TOKEN;
}

function pruneProcessedEvents() {
  const now = Date.now();
  for (const [key, timestamp] of processedEvents.entries()) {
    if (now - timestamp > PROCESSED_EVENT_TTL_MS) {
      processedEvents.delete(key);
    }
  }

  for (const [key, timestamp] of recentIncomingTexts.entries()) {
    if (now - timestamp > RECENT_TEXT_TTL_MS) {
      recentIncomingTexts.delete(key);
    }
  }

  for (const [key, value] of recentReplies.entries()) {
    if (now - value.timestamp > RECENT_TEXT_TTL_MS) {
      recentReplies.delete(key);
    }
  }
}

function buildEventKey(
  platform: Platform,
  senderId: string,
  event: { message?: { mid?: string; text?: string } },
) {
  const mid = event.message?.mid?.trim();
  if (mid) return `${platform}:mid:${mid}`;

  const normalizedText = (event.message?.text || "").trim().toLowerCase();
  return `${platform}:fallback:${senderId}:${normalizedText}`;
}

function markEventProcessed(key: string) {
  pruneProcessedEvents();
  if (processedEvents.has(key)) return false;
  processedEvents.set(key, Date.now());
  return true;
}

function normalizeText(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function markRecentIncomingText(
  platform: Platform,
  senderId: string,
  text: string,
) {
  pruneProcessedEvents();
  const key = `${platform}:${senderId}:${normalizeText(text)}`;
  if (recentIncomingTexts.has(key)) return false;
  recentIncomingTexts.set(key, Date.now());
  return true;
}

async function sendPlatformMessage(
  platform: Platform,
  senderId: string,
  text: string,
  token: string | undefined,
  pageId: string,
  igUserId?: string | null,
) {
  if (!token) {
    console.error("Missing page access token — message not sent", {
      platform,
      pageId,
      senderId,
    });
    return false;
  }

  try {
    if (platform === "facebook") {
      await sendTextMessage(senderId, text, token);
    } else {
      await sendIgTextMessage(igUserId || "", senderId, text, token);
    }
    return true;
  } catch (error) {
    console.error("Primary platform send failed", {
      platform,
      pageId,
      senderId,
      error,
    });

    if (text === FALLBACK_SEND_ERROR_MESSAGE) {
      return false;
    }

    try {
      if (platform === "facebook") {
        await sendTextMessage(senderId, FALLBACK_SEND_ERROR_MESSAGE, token);
      } else {
        await sendIgTextMessage(
          igUserId || "",
          senderId,
          FALLBACK_SEND_ERROR_MESSAGE,
          token,
        );
      }
    } catch (fallbackError) {
      console.error("Fallback platform send failed", {
        platform,
        pageId,
        senderId,
        fallbackError,
      });
    }

    return false;
  }
}

async function sendFacebookTypingIndicator(
  recipientId: string,
  token: string | undefined,
  pageId: string,
) {
  if (!token) {
    console.error("Missing page access token for typing indicator", {
      platform: "facebook",
      pageId,
      recipientId,
    });
    return;
  }

  try {
    await sendTypingOn(recipientId, token);
  } catch (error) {
    console.error("Messenger typing_on failed", {
      platform: "facebook",
      pageId,
      recipientId,
      error,
    });
  }
}

async function handleMessage(
  platform: Platform,
  senderId: string,
  text: string,
  pageId: string,
  igUserId?: string | null,
  token?: string,
) {
  if (platform === "facebook") {
    await sendFacebookTypingIndicator(senderId, token, pageId);
  }

  // --- Usage tracking: pre-check before AI call ---
  const usagePlatform = platform === "instagram" ? "instagram" : "messenger";
  let usage: Awaited<ReturnType<typeof trackMessageUsage>> | null = null;
  try {
    usage = await trackMessageUsage({
      pageId,
      platform: usagePlatform,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  } catch (err) {
    console.error("Usage pre-check failed, continuing anyway", { pageId, err });
  }

  // --- Load business data (knowledge from file, system prompt from DB if available) ---
  const { systemPrompt: fileSystemPrompt, business, knowledge } =
    await readBusinessData();
  const dbBotPrompt =
    usage && usage.allowed ? usage.bot_prompt : "";
  const effectiveSystemPrompt =
    dbBotPrompt || fileSystemPrompt || "You are a Mongolian AI receptionist.";

  const sessionId = `${platform}:${senderId}`;
  const history = getHistory(sessionId);
  const intent = detectIntent(text);
  const directReply = maybeGetDirectReply({
    userText: text,
    history,
    knowledge,
  });
  const lastReply = recentReplies.get(sessionId);

  appendMessage(sessionId, "user", text);

  if (directReply) {
    console.log("Webhook direct reply matched", { platform, senderId, intent });
    const safeDirectReply = sanitizeAssistantReply(directReply);

    if (lastReply && isDuplicateReply(lastReply.text, safeDirectReply)) {
      console.log("Skipping duplicate outbound reply", { platform, senderId });
      return;
    }

    appendMessage(sessionId, "assistant", safeDirectReply);
    recentReplies.set(sessionId, {
      text: safeDirectReply,
      timestamp: Date.now(),
    });

    await sendPlatformMessage(
      platform,
      senderId,
      safeDirectReply,
      token,
      pageId,
      igUserId,
    );
    return;
  }

  const prompt = buildPrompt({
    systemPrompt: effectiveSystemPrompt,
    business: business || {},
    history,
    userText: text,
  });

  let aiReply: string;
  try {
    const result = await askOpenAI(prompt);
    aiReply = result.text;

    // --- Usage tracking: log actual token usage after AI call ---
    if (usage && usage.allowed) {
      try {
        await trackMessageUsage({
          pageId,
          platform: usagePlatform,
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          totalTokens: result.usage.total_tokens,
        });
      } catch (err) {
        console.error("Usage post-track failed", { pageId, err });
      }
    }
  } catch {
    aiReply = "Уучлаарай, систем түр алдаатай байна.";
  }

  const safeReply = sanitizeAssistantReply(fixMojibake(aiReply));

  if (lastReply && isDuplicateReply(lastReply.text, safeReply)) {
    console.log("Skipping duplicate outbound reply", { platform, senderId });
    return;
  }

  appendMessage(sessionId, "assistant", safeReply);
  recentReplies.set(sessionId, { text: safeReply, timestamp: Date.now() });

  await sendPlatformMessage(
    platform,
    senderId,
    safeReply,
    token,
    pageId,
    igUserId,
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // ---------- VERIFY ----------
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && verifyToken(token))
      return res.status(200).send(challenge as string);
    return res.status(403).send("Verification failed");
  }

  // ---------- MESSAGES ----------
  if (req.method === "POST") {
    try {
      const body = req.body;

      if (body.object === "page" || body.object === "instagram") {
        for (const entry of body.entry || []) {
          const pageId =
            typeof entry?.id === "string" ? entry.id : String(entry?.id || "");
          const messagingEvents = Array.isArray(entry?.messaging)
            ? entry.messaging
            : [];

          for (const event of messagingEvents) {
            if (!event?.sender?.id) continue;
            if (event?.message?.is_echo) continue;

            const senderId = String(event.sender.id).trim();
            const text =
              typeof event?.message?.text === "string"
                ? event.message.text.trim()
                : "";

            if (!senderId || !text) continue;

            if (body.object === "page" && pageId !== PAGE_ID) {
              console.log("Skipping event for unexpected page", {
                pageId,
                senderId,
              });
              continue;
            }

            const platform: Platform =
              body.object === "instagram" ? "instagram" : "facebook";

            const token = FACEBOOK_TOKEN;

            if (!token) {
              console.error("Missing TOKEN_PAGE for page-connected messaging", {
                platform,
                pageId,
                senderId,
              });
              continue;
            }

            const eventKey = buildEventKey(platform, senderId, event);
            if (!markEventProcessed(eventKey)) {
              console.log("Skipping duplicate webhook event", {
                platform,
                eventKey,
              });
              continue;
            }
            if (!markRecentIncomingText(platform, senderId, text)) {
              console.log("Skipping repeated inbound text", {
                platform,
                senderId,
              });
              continue;
            }

            const conversationKey = `${platform}:${senderId}`;
            if (activeConversations.has(conversationKey)) {
              console.log("Skipping overlapping conversation event", {
                platform,
                senderId,
              });
              continue;
            }

            activeConversations.add(conversationKey);
            try {
              await handleMessage(
                platform,
                senderId,
                text,
                pageId,
                platform === "instagram" ? PAGE_ID : undefined,
                token,
              );
            } finally {
              activeConversations.delete(conversationKey);
            }
          }
        }
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(200).json({ ok: true });
    }
  }

  res.status(405).end();
}
