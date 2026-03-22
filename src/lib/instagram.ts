import fetch from "node-fetch";

export async function sendTextMessage(
  igUserId: string,
  recipientId: string,
  text: string,
  token: string,
) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${igUserId}/messages?access_token=${token}`,
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
