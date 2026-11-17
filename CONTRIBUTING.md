# Contributing to solana-ws-keepalive

Thanks for looking. solana-ws-keepalive is Solana WebSocket subscriptions that reconnect on their own, kept small on purpose, and it takes pull requests from anyone.

## The two-minute setup

```bash
git clone https://github.com/blixvip/solana-ws-keepalive.git
cd solana-ws-keepalive
npm test          # no install step: there are no dependencies
node bin/cli.js slots
```

Node 22 or newer is the easiest. That is the whole toolchain.

## Picking something to do

1. Look at the [good first issues](https://github.com/blixvip/solana-ws-keepalive/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22). Each one says which file to touch and where its test goes.
2. Comment "I'll take this" on the issue so two people do not do the same work. If nobody has answered in a day, start anyway.
3. Stuck, or have an idea that is not on the list? Ask in the Discord: **https://discord.gg/grokbot**. Running an idea past us first saves you writing something we cannot merge.

## What a pull request needs

- **A test.** New behaviour gets a case in `test/stream.test.js`. Tests run offline: fake the network, as the existing ones do.
- **No new dependencies.** Zero dependencies is the point of this library. If you think one is unavoidable, open an issue first.
- **No secrets.** Never put an RPC URL with a key in code, tests, or an issue. Errors and logs must not print one either.
- **Small and plain.** One change per pull request. Comments say why, not what.
- `npm test` passes.

## What you get

- Your name in the release notes of the version your change ships in.
- A say in where it goes next: the roadmap issue and the [Discord](https://discord.gg/grokbot) are where that is decided.

## Bugs

Open an issue with what you ran, what you expected and what happened. For anything that could expose a key or lose funds, do not open a public issue: message a maintainer in the Discord.

By contributing you agree that your work is released under the MIT license of this repository.
