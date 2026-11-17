// solana-ws-keepalive: Solana WebSocket subscriptions that stay alive. It notices a feed that has gone silent (the
// socket still "open", nothing arriving), reconnects with backoff, and puts every subscription back. No dependencies.
// Node 22+ (the built-in WebSocket) or any browser.
//
// A small, open piece of the plumbing behind Blix (https://blixvip.com), the Solana memecoin terminal.

export const PUBLIC_WS = "wss://api.mainnet-beta.solana.com";

const RECENT_SIGNATURE_LIMIT = 256;
const hostOf = (url) => { try { return new URL(url).host; } catch { return "endpoint"; } };

/**
 * Open a stream. Nothing connects until the first subscribe().
 * @param {object} options
 * @param {string} [options.url]              wss:// endpoint (default: the public one, which is rate limited).
 * @param {number} [options.silentMs=30000]   No message for this long means the feed is dead: reconnect.
 * @param {boolean} [options.heartbeat=false] Also subscribe to slots on the same socket, so a quiet subscription
 *                                            (a wallet that rarely trades) still proves the socket is alive every ~0.4 s.
 * @param {boolean} [options.dedupe=false] Suppress recent duplicate signatures for each logs subscription.
 * @param {number} [options.handshakeMs=10000] How long connecting and each subscribe confirmation may take.
 * @param {number} [options.minBackoffMs=500]
 * @param {number} [options.maxBackoffMs=30000]
 * @param {(state: 'connecting'|'open'|'reconnecting'|'closed', info: object) => void} [options.onState]
 * @param {typeof WebSocket} [options.WebSocket] A WebSocket class to use instead of the global one (tests, the `ws` package).
 */
export function createStream({ url = PUBLIC_WS, silentMs = 30_000, heartbeat = false, dedupe = false, handshakeMs = 10_000, minBackoffMs = 500, maxBackoffMs = 30_000, onState = null, WebSocket: WS = globalThis.WebSocket } = {}) {
  if (typeof WS !== "function") throw new Error("No WebSocket here: use Node 22+ or pass { WebSocket } (for example from the `ws` package).");
  const subs = new Map();        // local key -> { method, params, onData, onError, id (request), remote (subscription id) }
  const stats = { state: "idle", endpoint: hostOf(url), connects: 0, reconnects: 0, messages: 0, lastMessageAt: 0, lastError: null, silences: 0 };
  let ws = null, epoch = 0, nextId = 1, nextKey = 1, backoff = minBackoffMs, closed = false;
  let silenceTimer = null, retryTimer = null, handshakeTimer = null, beatKey = null;

  const say = (state, info = {}) => { stats.state = state; try { onState?.(state, { ...info, endpoint: stats.endpoint }); } catch {} };
  const clearTimers = () => { clearTimeout(silenceTimer); clearTimeout(handshakeTimer); silenceTimer = handshakeTimer = null; };
  function armSilence(mine) {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => { if (mine !== epoch) return; stats.silences++; drop(`nothing received for ${Math.round(silentMs / 1000)} s`); }, silentMs);
  }

  function sendSub(sub) {
    sub.id = nextId++; sub.remote = null;
    try { ws.send(JSON.stringify({ jsonrpc: "2.0", id: sub.id, method: sub.method, params: sub.params })); } catch {}
  }

  function connect() {
    if (closed || ws || !subs.size) return;
    const mine = ++epoch;
    say(stats.connects ? "reconnecting" : "connecting");
    let sock;
    try { sock = new WS(url); } catch (e) { stats.lastError = String(e?.message || e); return retry(); }
    ws = sock;
    // The handshake has a deadline of its own: a socket that never opens fires no close event on some networks.
    handshakeTimer = setTimeout(() => { if (mine === epoch && stats.state !== "open") drop("the connection did not open in time"); }, handshakeMs);
    sock.onopen = () => {
      if (mine !== epoch) return;
      clearTimeout(handshakeTimer);
      stats.connects++; backoff = minBackoffMs;
      say("open");
      for (const sub of subs.values()) sendSub(sub);
      armSilence(mine);
    };
    sock.onmessage = (ev) => {
      if (mine !== epoch) return;
      stats.messages++; stats.lastMessageAt = Date.now();
      armSilence(mine);
      let m; try { m = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)); } catch { return; }
      if (m.id != null) {   // the answer to a subscribe
        for (const sub of subs.values()) if (sub.id === m.id) {
          if (m.error) { try { sub.onError?.(new Error(m.error.message || "subscribe refused")); } catch {} }
          else sub.remote = m.result;
        }
        return;
      }
      const remote = m.params?.subscription;
      if (remote == null) return;
      for (const sub of subs.values()) {
        if (sub.remote !== remote) continue;
        const result = m.params.result;
        const signature = result?.value?.signature;
        if (sub.recentSignatures && typeof signature === "string" && signature.length > 0) {
          if (sub.recentSignatures.has(signature)) continue;
          sub.recentSignatures.add(signature);
          if (sub.recentSignatures.size > RECENT_SIGNATURE_LIMIT) {
            sub.recentSignatures.delete(sub.recentSignatures.values().next().value);
          }
        }
        try { sub.onData(result, m); } catch {}
      }
    };
    sock.onerror = () => { if (mine === epoch) stats.lastError = "socket error"; };
    sock.onclose = (ev) => { if (mine === epoch) drop(`closed${ev?.code ? ` (${ev.code})` : ""}`, true); };
  }

  // The current socket is finished with, whatever state it is in; a new one follows after the backoff.
  function drop(why, already = false) {
    stats.lastError = why;
    clearTimers();
    const old = ws; ws = null; epoch++;
    if (old && !already) { try { old.onopen = old.onmessage = old.onerror = old.onclose = null; old.close(); } catch {} }
    for (const sub of subs.values()) sub.remote = null;
    retry();
  }
  function retry() {
    if (closed || !subs.size || retryTimer) return;
    stats.reconnects++;
    const wait = Math.round(backoff * (0.5 + Math.random()));   // jitter: many clients cut off together do not all return together
    backoff = Math.min(maxBackoffMs, backoff * 2);
    say("reconnecting", { inMs: wait, why: stats.lastError });
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, wait);
    retryTimer.unref?.();
  }

  function subscribe(method, params = [], onData, onError = null) {
    if (typeof onData !== "function") throw new TypeError("subscribe(method, params, onData): onData must be a function");
    if (closed) throw new Error("this stream is closed");
    const key = nextKey++;
    // A signature identifies a log transaction. Other feeds have different identities and replay rules.
    const recentSignatures = dedupe && method === "logsSubscribe" ? new Set() : null;
    const sub = { method, params, onData, onError, id: null, remote: null, recentSignatures };
    subs.set(key, sub);
    if (heartbeat && beatKey == null && method !== "slotSubscribe") { beatKey = nextKey++; subs.set(beatKey, { method: "slotSubscribe", params: [], onData() {}, onError: null, id: null, remote: null }); if (ws && stats.state === "open") sendSub(subs.get(beatKey)); }
    if (ws && stats.state === "open") sendSub(sub); else connect();
    return function unsubscribe() {
      if (!subs.delete(key)) return;
      if (ws && stats.state === "open" && sub.remote != null) { try { ws.send(JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: method.replace(/Subscribe$/, "Unsubscribe"), params: [sub.remote] })); } catch {} }
      const real = [...subs.keys()].filter((k) => k !== beatKey);
      if (!real.length) { if (beatKey != null) { subs.delete(beatKey); beatKey = null; } shut(false); }
    };
  }

  function shut(forGood) {
    if (forGood) closed = true;
    clearTimers(); clearTimeout(retryTimer); retryTimer = null;
    const old = ws; ws = null; epoch++;
    if (old) { try { old.onopen = old.onmessage = old.onerror = old.onclose = null; old.close(); } catch {} }
    if (forGood) subs.clear();
    say(forGood ? "closed" : "idle");
  }

  return {
    subscribe,
    /** Close the socket and forget every subscription. */
    close: () => shut(true),
    /** state, connects, reconnects, messages, lastMessageAt, silences (dead feeds caught), lastError. */
    stats: () => ({ ...stats, subscriptions: [...subs.keys()].filter((k) => k !== beatKey).length }),
  };
}

/** One subscription on a stream of its own. Returns { close, stats }. */
export function subscribe({ method, params = [], onData, onError = null, ...options }) {
  const stream = createStream(options);
  stream.subscribe(method, params, onData, onError);
  return { close: stream.close, stats: stream.stats };
}
