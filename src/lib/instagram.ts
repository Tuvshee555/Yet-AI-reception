import fetch from "node-fetch";

const IG_TOKEN = process.env.TOKEN_PAGE_2 || process.env.INSTAGRAM_TOKEN;

function requireToken() {
  if (!IG_TOKEN) throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN not set");
  return IG_TOKEN;
}

export async function sendTextMessage(
  igUserId: string,
  recipientId: string,
  text: string,
) {
  const token = requireToken();

  const res = await fetch(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_type: "RESPONSE",
        recipient: { id: recipientId },
        message: { text },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Instagram send failed: ${res.status} ${body}`);
  }
}
//
