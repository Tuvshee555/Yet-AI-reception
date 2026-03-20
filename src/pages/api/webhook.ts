import type { NextApiRequest, NextApiResponse } from "next";
import { askOpenAI } from "../../lib/openai";
import { sendTextMessage, sendTypingOn } from "../../lib/messenger";
import { sendTextMessage as sendIgTextMessage } from "../../lib/instagram";
import { rateLimit } from "../../lib/rateLimit";
import { detectIntent, readBusinessData } from "../../lib/businessData";
import { appendMessage, buildPrompt, getHistory } from "../../lib/conversation";
import { maybeGetDirectReply } from "../../lib/directReplies";
import { fixMojibake } from "../../lib/encoding";
import { isDuplicateReply, sanitizeAssistantReply } from "../../lib/reply";

const FB_VERIFY = process.env.VERIFY_TOKEN;
const IG_VERIFY = process.env.VERIFY_TOKEN;
const PAGE_TOKENS: Record<string, string | undefined> = {
  "614185355370930": process.env.TOKEN_PAGE_1,
  "601173946571365": process.env.TOKEN_PAGE_2,
};
const FALLBACK_SEND_ERROR_MESSAGE = "Уучлаарай, мессеж илгээхэд алдаа гарлаа.";

type Platform = "facebook" | "instagram";

const PROCESSED_EVENT_TTL_MS = 2 * 60 * 1000;
const RECENT_TEXT_TTL_MS = 20 * 1000;
const processedEvents = new Map<string, number>();
const activeConversations = new Set<string>();
const recentIncomingTexts = new Map<string, number>();
const recentReplies = new Map<string, { text: string; timestamp: number }>();

function verifyToken(token: unknown) {
  return token === FB_VERIFY || token === IG_VERIFY;
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
    console.error("Missing page access token", {
      platform,
      pageId,
      senderId,
    });
    console.error(
      "Fallback message was not sent because no token is configured",
      {
        platform,
        pageId,
        senderId,
      },
    );
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
  const limit = rateLimit(
    `${platform === "facebook" ? "fb" : "ig"}:${senderId}`,
    20,
    10 * 60 * 1000,
  );
  if (!limit.allowed) {
    const waitMsg = "Түр хүлээнэ үү, дараа оролдоно уу.";
    await sendPlatformMessage(
      platform,
      senderId,
      waitMsg,
      token,
      pageId,
      igUserId,
    );
    return;
  }

  if (platform === "facebook") {
    await sendFacebookTypingIndicator(senderId, token, pageId);
  }

  const { systemPrompt, business, knowledge } = await readBusinessData();
  const sessionId = `${platform}:${senderId}`;
  const history = getHistory(sessionId);
  const intent = detectIntent(text);
  const directReply =
    intent === "program" || intent === "price"
      ? maybeGetDirectReply({
          userText: text,
          history,
          knowledge,
        })
      : null;
  const recentReplyKey = `${platform}:${senderId}`;
  const lastReply = recentReplies.get(recentReplyKey);

  appendMessage(sessionId, "user", text);

  if (directReply) {
    const safeDirectReply = sanitizeAssistantReply(directReply);

    if (lastReply && isDuplicateReply(lastReply.text, safeDirectReply)) {
      console.log("Skipping duplicate outbound reply", { platform, senderId });
      return;
    }

    appendMessage(sessionId, "assistant", safeDirectReply);
    recentReplies.set(recentReplyKey, {
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
    systemPrompt: systemPrompt || "You are a Mongolian AI receptionist.",
    business: business || {},
    history,
    userText: text,
  });

  let aiReply = "Сайн байна уу!";

  try {
    aiReply = await askOpenAI(prompt);
  } catch {
    aiReply = "Уучлаарай, систем түр алдаатай байна.";
  }

  const safeReply = sanitizeAssistantReply(fixMojibake(aiReply));

  if (lastReply && isDuplicateReply(lastReply.text, safeReply)) {
    console.log("Skipping duplicate outbound reply", { platform, senderId });
    return;
  }

  appendMessage(sessionId, "assistant", safeReply);
  recentReplies.set(recentReplyKey, { text: safeReply, timestamp: Date.now() });

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

      console.log("WEBHOOK BODY:", JSON.stringify(body, null, 2));

      if (body.object === "page" || body.object === "instagram") {
        const platform: Platform =
          body.object === "page" ? "facebook" : "instagram";
        for (const entry of body.entry || []) {
          const pageId = entry.id;

          if (pageId === "614185355370930") continue; // 🔥 Chinese page OFF
          const token = PAGE_TOKENS[pageId];

          for (const event of entry.messaging || []) {
            if (!event.message || !event.sender) continue;
            if (event.message.is_echo) continue;

            const senderId = event.sender.id;
            const text = (event.message.text || "").trim();
            if (!text) continue;
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

            const igUserId = platform === "instagram" ? entry.id : undefined;
            if (platform === "instagram" && !igUserId) {
              console.error("Instagram entry.id missing; cannot reply.");
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
                igUserId,
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
