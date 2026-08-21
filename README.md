# Flagship

Flagship is a standalone, objective-first CTF bot for the public [BaboViolent bot API](https://baboviolent.net/bot-api). It is not one of the bots embedded in the dedicated server: it connects over the same WebSocket API available to community bot authors.

Its priorities are intentionally lopsided:

1. Finish a capture when carrying the enemy flag.
2. Return a dropped home flag or intercept its carrier.
3. Escort a friendly carrier.
4. Take the enemy flag.
5. Fight only when the fight protects an objective or is unlikely to ruin survival.

The policy takes its starting values from the Rust server bots, where capture and recovery utility greatly outweigh ordinary combat. A progress watchdog provides wall/stuck recovery without depending on private server state. Flagship also tracks its K/D, captures, returns, and current objective in structured logs.

## Run

Node.js 22 or newer has everything required; there are no runtime packages to install.

```sh
npm test
npm start
```

Configuration:

| Variable | Default | Meaning |
|---|---|---|
| `BV2_SERVER` | `wss://nc-ctf.baboviolent.net/bot/ws` | Clean external bot WebSocket endpoint |
| `BV2_TEAM` | `0` | `0` for blue or `1` for red |
| `BV2_PLAYER_NAME` | `^4Flag^1ship` | Independent in-game name; Babo colors and Alt-code glyphs are supported |

Or run the container:

```sh
docker build -t flagship-bot .
docker run --rm flagship-bot
```

The handshake reports implementation `Flagship`, its version, and author `BaboViolent`; the server appends ` [bot]` to the independently configured in-game name.

## Design notes

- Server snapshots are authoritative. Local movement is corrected by incoming coordinate frames.
- A carrier suppresses distant optional fights and drives through the actual home pod position, avoiding the old stop-short failure mode.
- The bot immediately answers pings and reconnects with exponential backoff.
- Movement runs at about 30 Hz, below the API's advertised 60 Hz allowance.
- Hitscan requests are still validated for range, timing, and line of sight by the server.

See [the Bot API guide](https://baboviolent.net/bot-api) for the complete wire contract.
