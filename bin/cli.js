#!/usr/bin/env node
// solana-ws-keepalive slots | logs <address> | account <address> | raw <method> [json params]
import { createStream, PUBLIC_WS } from "../src/index.js";

const [what, a, b] = process.argv.slice(2);
const help = `solana-ws-keepalive: a Solana WebSocket subscription that reconnects on its own

  solana-ws-keepalive slots                     every new slot
  solana-ws-keepalive logs <program or wallet>  transactions that mention an address
  solana-ws-keepalive account <address>         changes to one account
  solana-ws-keepalive raw <method> [params]     any *Subscribe method, params as JSON

  SOLANA_WS_URL   wss:// endpoint (default: ${PUBLIC_WS}, rate limited)
  SILENT_MS       silence that counts as a dead feed (default 30000)

  Made by Blix, the Solana memecoin terminal: https://blixvip.com   Discord: https://discord.gg/grokbot`;
const plans = {
  slots: () => ["slotSubscribe", []],
  logs: () => a && ["logsSubscribe", [{ mentions: [a] }, { commitment: "confirmed" }]],
  account: () => a && ["accountSubscribe", [a, { encoding: "jsonParsed", commitment: "confirmed" }]],
  raw: () => { if (!a) return null; try { return [a, b ? JSON.parse(b) : []]; } catch { return null; } },
};
const plan = plans[what]?.();
if (!plan) { console.log(help); process.exit(what && what !== "-h" && what !== "--help" ? 1 : 0); }

const stream = createStream({
  url: process.env.SOLANA_WS_URL || PUBLIC_WS,
  silentMs: Number(process.env.SILENT_MS) || 30_000,
  heartbeat: what !== "slots",
  onState: (state, info) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${state}${info.why ? `: ${info.why}` : ""}${info.inMs ? `, again in ${info.inMs} ms` : ""}`),
});
stream.subscribe(plan[0], plan[1], (data) => console.log(JSON.stringify(data)), (e) => console.error(`subscribe refused: ${e.message}`));
process.on("SIGINT", () => { stream.close(); console.error(JSON.stringify(stream.stats())); process.exit(0); });
