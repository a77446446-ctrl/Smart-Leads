"use strict";

const http = require("http");

const hostname = process.env.INTERNAL_APP_HOST || "127.0.0.1";
const parsedPort = Number.parseInt(process.env.PORT || "3000", 10);
const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
const cronSecret = process.env.CRON_SECRET || "";
const state = { parser: false, bot: false, discovery: false };

console.log("[CRON] Watchdog started for http://" + hostname + ":" + port);
if (cronSecret.length === 0 && process.env.NODE_ENV === "production") {
  console.error("[CRON] CRON_SECRET is required in production");
}

function callInternal(path, key, onSuccess, timeoutMs = 0) {
  if (state[key]) return;
  state[key] = true;
  const headers = cronSecret ? { Authorization: "Bearer " + cronSecret } : {};
  const req = http.request({ hostname, port, path, method: "POST", headers }, (res) => {
    let data = "";
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      if (data.length < 64 * 1024) data += chunk.slice(0, 64 * 1024 - data.length);
    });
    res.on("end", () => {
      state[key] = false;
      if (res.statusCode === 200) {
        try { onSuccess(JSON.parse(data)); }
        catch { console.error("[CRON] Invalid JSON response from " + path); }
        return;
      }
      console.error("[CRON] " + path + " HTTP " + res.statusCode + ": " + data.slice(0, 300));
    });
  });
  req.on("error", (error) => {
    state[key] = false;
    console.error("[CRON] " + path + " failed: " + error.message);
  });
  if (timeoutMs > 0) {
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Request timed out after " + timeoutMs + " ms"));
    });
  }
  req.end();
}

function pollParser() {
  callInternal("/api/admin/parser/cron", "parser", (result) => {
    if (result.skipped === false || result.skipped === undefined) {
      console.log("[CRON] Parser -> new leads: " + (result.leadsCount || 0));
    }
  });
}

function pollBot() {
  callInternal("/api/internal/bot/dispatch", "bot", (result) => {
    if ((result.processed || 0) > 0) {
      console.log("[CRON] MAX Bot -> sent: " + (result.sent || 0) + ", retry: " + (result.retried || 0) + ", failed: " + (result.failed || 0));
    }
  }, 180_000);
}

function pollDiscovery() {
  callInternal("/api/internal/discovery/run", "discovery", (result) => {
    if (!result.skipped) {
      console.log("[CRON] Discovery -> candidates: " + (result.candidates || 0) + ", activated: " + (result.activated || 0));
    }
  });
}

setInterval(pollParser, 10_000);
setInterval(pollBot, 5_000);
setInterval(pollDiscovery, 60_000);
