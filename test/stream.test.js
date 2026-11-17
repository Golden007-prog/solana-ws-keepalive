import test from "node:test";
import assert from "node:assert/strict";
import { createStream } from "../src/index.js";

// A WebSocket the test drives by hand.
function fakeSockets() {
  const all = [];
  class Fake {
    constructor(url) { this.url = url; this.sent = []; this.closed = false; all.push(this); }
    send(text) { this.sent.push(JSON.parse(text)); }
    close() { this.closed = true; }
    open() { this.onopen?.(); }
    say(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
    die(code = 1006) { this.onclose?.({ code }); }
  }
  return { Fake, all };
}
const tick = (ms) => new Promise((ok) => setTimeout(ok, ms));
const quick = { minBackoffMs: 5, maxBackoffMs: 20, handshakeMs: 200 };

test("data reaches the subscriber that asked for it", () => {
  const { Fake, all } = fakeSockets(), got = [];
  const s = createStream({ WebSocket: Fake, ...quick });
  s.subscribe("logsSubscribe", [{ mentions: ["A"] }], (d) => got.push(["a", d]));
  s.subscribe("slotSubscribe", [], (d) => got.push(["slot", d]));
  all[0].open();
  const [first, second] = all[0].sent;
  all[0].say({ id: first.id, result: 11 }); all[0].say({ id: second.id, result: 22 });
  all[0].say({ method: "slotNotification", params: { subscription: 22, result: { slot: 5 } } });
  all[0].say({ method: "logsNotification", params: { subscription: 11, result: "tx" } });
  assert.deepEqual(got, [["slot", { slot: 5 }], ["a", "tx"]]);
  s.close();
});

test("a closed socket is replaced and every subscription is sent again", async () => {
  const { Fake, all } = fakeSockets(), states = [];
  const s = createStream({ WebSocket: Fake, ...quick, onState: (st) => states.push(st) });
  s.subscribe("slotSubscribe", [], () => {});
  all[0].open(); all[0].die();
  await tick(60);
  assert.equal(all.length, 2, "a second socket was opened");
  all[1].open();
  assert.equal(all[1].sent[0].method, "slotSubscribe");
  assert.deepEqual(states.filter((x) => x === "open").length, 2);
  assert.equal(s.stats().reconnects, 1);
  s.close();
});

test("a feed that goes silent is treated as dead, though the socket never closed", async () => {
  const { Fake, all } = fakeSockets();
  const s = createStream({ WebSocket: Fake, ...quick, silentMs: 40 });
  s.subscribe("slotSubscribe", [], () => {});
  all[0].open();
  await tick(120);
  assert.ok(all[0].closed, "the silent socket was closed");
  assert.ok(all.length >= 2, "and a new one opened");
  assert.ok(s.stats().silences >= 1);
  s.close();
});

test("a connection that never opens is given up on", async () => {
  const { Fake, all } = fakeSockets();
  const s = createStream({ WebSocket: Fake, minBackoffMs: 5, maxBackoffMs: 20, handshakeMs: 30 });
  s.subscribe("slotSubscribe", [], () => {});
  await tick(120);
  assert.ok(all.length >= 2);
  s.close();
});

test("heartbeat adds one slot subscription beside a quiet one", () => {
  const { Fake, all } = fakeSockets();
  const s = createStream({ WebSocket: Fake, ...quick, heartbeat: true });
  s.subscribe("accountSubscribe", ["A"], () => {});
  all[0].open();
  assert.deepEqual(all[0].sent.map((m) => m.method).sort(), ["accountSubscribe", "slotSubscribe"]);
  assert.equal(s.stats().subscriptions, 1, "the heartbeat is not counted as yours");
  s.close();
});

test("unsubscribing the last subscription closes the socket; close() stops reconnects", async () => {
  const { Fake, all } = fakeSockets();
  const s = createStream({ WebSocket: Fake, ...quick });
  const off = s.subscribe("slotSubscribe", [], () => {});
  all[0].open(); all[0].say({ id: all[0].sent[0].id, result: 9 });
  off();
  assert.equal(all[0].sent.at(-1).method, "slotUnsubscribe");
  assert.ok(all[0].closed);
  s.close();
  await tick(50);
  assert.equal(all.length, 1);
  assert.throws(() => s.subscribe("slotSubscribe", [], () => {}), /closed/);
});

test("a refused subscribe reaches onError", () => {
  const { Fake, all } = fakeSockets(); let err = null;
  const s = createStream({ WebSocket: Fake, ...quick });
  s.subscribe("blockSubscribe", [], () => {}, (e) => { err = e; });
  all[0].open(); all[0].say({ id: all[0].sent[0].id, error: { code: -32601, message: "Method not found" } });
  assert.match(err.message, /Method not found/);
  s.close();
});
