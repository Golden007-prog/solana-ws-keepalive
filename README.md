# solana-ws-keepalive

**Solana WebSocket subscriptions that stay alive.** It notices a feed that has gone silent while the socket still looks open, reconnects with backoff, and puts every subscription back. Zero dependencies.

![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)
![node: 22+](https://img.shields.io/badge/node-22%2B-blue)
[![license: MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/grokbot)

<a href="https://blixvip.com"><img src="assets/blix-hero.jpg" width="100%" alt="BLIX: AI-powered Solana memecoin terminal. Trade memes first."></a>

**[Start trading at blixvip.com →](https://blixvip.com)** &nbsp;·&nbsp; [Public API](https://blixvip.com/api) &nbsp;·&nbsp; [MCP server](https://blixvip.com/mcp) &nbsp;·&nbsp; [Discord](https://discord.gg/grokbot)

Built by the team behind **[Blix](https://blixvip.com)**, the 0% fee Solana memecoin terminal. Blix listens to every pump.fun launch and trade around the clock; this is a small, open version of the part that keeps those streams from dying quietly.

## The problem

A Solana WebSocket does not always tell you when it stops working. The connection stays "open", no `close` event fires, and `logsSubscribe` or `accountSubscribe` simply stops delivering. A sniper, copy-trade bot or dashboard then sits on stale data until someone restarts it. Reconnecting on `close` is not enough: you have to watch for silence.

## Install

```bash
npm install github:blixvip/solana-ws-keepalive
```

Node 22 or newer (it uses the built-in `WebSocket`), or any browser. On older Node, pass the `ws` package as `WebSocket`.

## Use it

```js
import { createStream } from "solana-ws-keepalive";

const stream = createStream({
  url: "wss://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
  silentMs: 30_000,      // no message for 30 s means the feed is dead
  heartbeat: true,       // keep a slot subscription beside quiet ones, so silence means something
  onState: (state, info) => console.log(state, info.why ?? ""),
});

// Every transaction that mentions an address (a program, a pool, a wallet).
const stop = stream.subscribe(
  "logsSubscribe",
  [{ mentions: ["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"] }, { commitment: "confirmed" }],
  (result) => console.log(result.value.signature),
);

// Several subscriptions share one socket and all come back after a reconnect.
stream.subscribe("accountSubscribe", ["<account>", { encoding: "jsonParsed" }], (result) => console.log(result.value));

// later
stop();
stream.close();
```

### Command line

```bash
npx github:blixvip/solana-ws-keepalive slots
npx github:blixvip/solana-ws-keepalive logs 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
npx github:blixvip/solana-ws-keepalive account <address>
```

Set `SOLANA_WS_URL` to your own endpoint. The public one works for a quick look and is rate limited.

## What it does

| | |
|---|---|
| **Dead-feed detection** | If nothing arrives for `silentMs`, the socket is closed and replaced, whether or not it ever reported a problem. |
| **Heartbeat** | With `heartbeat: true`, a slot subscription rides on the same socket. A wallet that trades once an hour still proves the connection is alive every 0.4 s. |
| **Handshake deadline** | A connection that never opens is abandoned after `handshakeMs` instead of hanging forever. |
| **Backoff with jitter** | Reconnects wait 0.5 s, 1 s, 2 s, up to 30 s, randomised so a fleet cut off together does not return together. |
| **Automatic resubscribe** | Every subscription is sent again on the new socket. Your callbacks keep working; you do not track subscription ids. |
| **One socket, many subscriptions** | `subscribe()` as often as you like. Unsubscribing the last one closes the socket. |

## API

`createStream(options)` returns `{ subscribe, close, stats }`.

| Option | Default | |
|---|---|---|
| `url` | the public endpoint | `wss://` URL. |
| `silentMs` | `30000` | Silence that counts as a dead feed. |
| `heartbeat` | `false` | Add a slot subscription as a liveness signal. |
| `handshakeMs` | `10000` | Longest a connection may take to open. |
| `minBackoffMs` / `maxBackoffMs` | `500` / `30000` | Reconnect delays. |
| `onState` | none | Called with `connecting`, `open`, `reconnecting`, `closed`. |
| `WebSocket` | global `WebSocket` | Pass the `ws` package on Node below 22. |

- `subscribe(method, params, onData, onError?)` returns an `unsubscribe` function. `method` is any Solana `*Subscribe` method.
- `stats()` returns the state, connects, reconnects, messages, last message time, and how many dead feeds were caught.
- `subscribe({ method, params, onData, ...options })` is a shortcut for a single subscription on its own stream.

## What this is not

This is the simple version. It does not fill the gap in data from while the socket was down, de-duplicate across several providers, or account for bandwidth. [Blix](https://blixvip.com) does that so its charts and trades never have holes; if you want the live terminal rather than the plumbing, use Blix. For plain HTTP calls, see [solana-rpc-pool](https://github.com/blixvip/solana-rpc-pool).

## FAQ

**Why does my Solana `logsSubscribe` stop receiving messages?** Usually the provider dropped the subscription or the connection without a close frame. Detect silence and reconnect; that is what this library does.

**How do I keep a Solana WebSocket connection alive?** Reconnect on close, also reconnect on silence, and resubscribe after every reconnect. A heartbeat subscription makes silence meaningful for quiet accounts.

**Does it work with Helius, QuickNode, Triton, Alchemy?** Yes. It speaks the standard Solana WebSocket JSON-RPC.

**Will I miss messages during a reconnect?** Yes, whatever happened while the socket was down is not replayed. If you need every transaction, backfill with `getSignaturesForAddress` after `onState` reports `open` again.

## Contributing

Pull requests are welcome, and this is a good first open source project: the whole library is a few hundred lines, there is nothing to install, and `npm test` runs in a second.

[![good first issues](https://img.shields.io/github/issues/blixvip/solana-ws-keepalive/good%20first%20issue?label=good%20first%20issues&color=7057ff)](https://github.com/blixvip/solana-ws-keepalive/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22)
[![help wanted](https://img.shields.io/github/issues/blixvip/solana-ws-keepalive/help%20wanted?label=help%20wanted&color=008672)](https://github.com/blixvip/solana-ws-keepalive/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22help%20wanted%22)
[![Discord](https://img.shields.io/badge/Discord-ask%20before%20you%20build-5865F2?logo=discord&logoColor=white)](https://discord.gg/grokbot)

1. Pick a [good first issue](https://github.com/blixvip/solana-ws-keepalive/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22) and comment that you are taking it.
2. `git clone`, change the code, add a test, `npm test`.
3. Open a pull request. Contributors are credited in the release notes.

See [CONTRIBUTING.md](CONTRIBUTING.md). Questions go in the [Discord](https://discord.gg/grokbot).

<a href="https://github.com/blixvip/solana-ws-keepalive/graphs/contributors"><img src="https://contrib.rocks/image?repo=blixvip/solana-ws-keepalive" alt="Contributors to solana-ws-keepalive"></a>

## More from Blix

| | |
|---|---|
| [pump-curve](https://github.com/blixvip/pump-curve) | Read a pump.fun bonding curve: price, market cap, progress, migration |
| [pump-stream](https://github.com/blixvip/pump-stream) | Every pump.fun launch and trade, live over one WebSocket |
| [sol-holders](https://github.com/blixvip/sol-holders) | Top holders of any Solana token, with pools and curves left out |
| [solana-swap-parser](https://github.com/blixvip/solana-swap-parser) | What a Solana transaction traded: wallet, sold, bought, price, DEX |
| [solana-rpc-pool](https://github.com/blixvip/solana-rpc-pool) | A Solana RPC load balancer: several endpoints, rate limits, failover |

**[Blix](https://blixvip.com)** is a Solana memecoin terminal with 0% fees on every trade: every pump.fun launch live, AI coin ratings, narratives, wallet and X tracking, and one-click trading.

- Website: **https://blixvip.com**
- This project's page: https://blixvip.github.io/solana-ws-keepalive/
- Public API: https://blixvip.com/api &nbsp;·&nbsp; MCP server for AI agents: https://blixvip.com/mcp
- More open source from the same team: https://github.com/blixvip
- Questions, ideas, or help with this library: **[discord.gg/grokbot](https://discord.gg/grokbot)**

## License

MIT
