"use strict";

const token = (process.env.MAX_BOT_TOKEN || "").trim();
const secret = (process.env.MAX_WEBHOOK_SECRET || "").trim();
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");

if (!token) throw new Error("MAX_BOT_TOKEN не настроен");
if (!/^[A-Za-z0-9_-]{5,256}$/.test(secret)) {
  throw new Error("MAX_WEBHOOK_SECRET должен содержать 5–256 символов A-Z, a-z, 0-9, _ или -");
}

const webhookUrl = new URL("/api/webhooks/max", appUrl);
if (webhookUrl.protocol !== "https:" || webhookUrl.port) {
  throw new Error("NEXT_PUBLIC_APP_URL должен быть HTTPS-доменом без нестандартного порта");
}

async function main() {
  const response = await fetch("https://platform-api2.max.ru/subscriptions", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl.toString(),
      update_types: [
        "bot_started",
        "bot_stopped",
        "bot_added",
        "bot_removed",
        "chat_title_changed",
        "message_created",
        "dialog_removed",
        "dialog_muted",
        "dialog_unmuted",
      ],
      secret,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || !result || result.success !== true) {
    throw new Error("MAX отклонил настройку webhook, HTTP " + response.status);
  }
  console.log("[MAX BOT] Webhook настроен: " + webhookUrl.toString());
}

main().catch((error) => {
  console.error("[MAX BOT] " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
