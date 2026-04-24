import { supabase } from "./supabase";

type TrackInput = {
  pageId: string;
  platform: "instagram" | "messenger";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type TrackResult =
  | { allowed: true; business_id: string; bot_prompt: string }
  | { allowed: false; reason: string };

export async function trackMessageUsage({
  pageId,
  platform,
  promptTokens,
  completionTokens,
  totalTokens,
}: TrackInput): Promise<TrackResult> {
  console.log("=== trackMessageUsage START ===");
  console.log("Input:", { pageId, platform, promptTokens, completionTokens, totalTokens });

  try {
    // STEP 1 — Find business by page ID
    const { data: account, error: accountError } = await supabase
      .from("platform_accounts")
      .select("business_id")
      .eq("external_id", pageId)
      .single();

    if (accountError || !account) {
      console.error("Business lookup failed", { pageId, accountError });
      return { allowed: false, reason: "Business not found" };
    }

    const businessId = account.business_id;

    // STEP 2 — Check business status and get bot prompt
    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("status, bot_prompt")
      .eq("id", businessId)
      .single();

    if (businessError || !business) {
      console.error("Business status lookup failed", { businessId, businessError });
      return { allowed: false, reason: "Business not found" };
    }

    if (business.status !== "active") {
      console.log("Bot paused: status is", business.status);
      return { allowed: false, reason: "Bot paused" };
    }

    // STEP 3 — Log usage (non-blocking, no limits enforced)
    if (totalTokens > 0) {
      const creditsUsed = Math.ceil(totalTokens / 1000);
      supabase.from("message_logs").insert({
        business_id: businessId,
        platform,
        message_count: 1,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        credits_used: creditsUsed,
        source: "api",
      }).then(({ error }) => {
        if (error) console.error("Message log insert failed", { businessId, error });
      });
    }

    console.log("=== trackMessageUsage SUCCESS ===", { businessId });
    return {
      allowed: true,
      business_id: businessId,
      bot_prompt: business.bot_prompt || "",
    };
  } catch (error) {
    console.error("trackMessageUsage UNEXPECTED ERROR", { pageId, error });
    return { allowed: false, reason: "Internal error" };
  }
}
