# CLAUDE.md

This file guides coding agents working in this repository. Read it before changing code. Keep shared project guidance here; AGENTS.md points to this file.

## What this is

A two-player browser game inspired by Hive, with Classic rules and combinable Mosquito, Ladybug, and Pillbug expansions. Plain Node.js 22.9+, ES modules, no runtime dependencies, no client framework, and no build step for our own code. The server serves the committed assets in public/. It can also run as a Discord Activity (see below).

## Commands

```sh
npm start                       # http://127.0.0.1:3007; loads .env if present (PORT, HOST, ALLOW_GUESTS, Discord credentials)
npm test                        # All rules, table, and HTTP tests
node --test tests/rules.test.mjs # One test file
npm install && npm run build    # Regenerate public/discord-sdk.js; never edit that bundle by hand
```

Test online play in two tabs: each holds its own seat in sessionStorage. All modes, including hot-seat and bot play, need the server. Do not add an install or build requirement without a concrete need.

## Architecture

- public/engine.js: shared rules engine, species definitions, legal actions, expansion normalization, board helpers, and bot heuristic. initial() creates JSON state; apply() returns a new state and rejects illegal moves. Coordinates use axial hex strings. Preserve one-hive connectivity and height-sensitive sliding gates for every movement and carry.
- table.mjs: authoritative table lifecycle and mutable room transitions. Owns seats, host, game mode, expansion settings, timer, undo window, bot scheduling, rematches, and scores. tableView() returns the client snapshot; it leaves out state.repetitions, which only the server's draw check needs and which grows every turn. Keep authorization and setting validation here rather than trusting the browser.
- server.mjs: Node HTTP adapter, static assets, table codes, bearer seat tokens, and in-memory room storage. The 200ms ticker advances bots and expired timers. GET /api/state?since=<version> long-polls: it answers when the table's version changes, the table closes, or the seat is lost, or after config.longPollMs (25s). Every POST and every tick wakes waiting requests, so any change that bumps r.version reaches clients without polling. /api/move checks the room version to reject stale actions. Exported server can listen on an ephemeral port in tests; importing it must not start a listener.
- public/app.js: DOM rendering, long polling, Discord boot, session state, selection, board fitting, controls, and sound. public/index.html and public/style.css define the interface. public/icons.js contains the pixel SVG icon system; public/names.js generates colour + bug names.
- public/fireflies.js: cosmetic per-piece timers for Firefly artwork. Each light switches after a fresh random 2–20 second delay, independent of turns and DOM redraws. public/art/F.svg is unlit; F-lit.svg is lit. Firefly uses type F, has two tiles per player, and slides exactly three steps without retracing.
- tests/: base rules, expansion edge cases, table transitions, and two-client HTTP integration tests using Node's built-in runner.

Tables expire without client activity: unstarted lobbies after 10 minutes, games after 24 hours. All tables disappear on restart. server.mjs caps tables at 500, closing the longest-abandoned lobby (no client for a minute) to make room and otherwise refusing new tables. It lists an open table only while its host is connected; config holds these limits so tests can shorten them. Run one server process. No database or account system is involved; the only external service is Discord's OAuth API, called by /api/login.

## Discord Activity

- Discord's Activity frame adds frame_id to the URL. boot() in app.js then loads public/discord-sdk.js and runs ready, authorize (scope identify), POST /api/login with the code, and authenticate. Outside Discord the same page runs as before.
- /api/login exchanges the code server-side with DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET, reads the Discord user, and returns an identity token that lasts a day. create and join take it as identity and seat the player under their verified Discord name, never a client-supplied one.
- Guests (no identity) may play unless ALLOW_GUESTS=false or NODE_ENV=production; GET /api/config reports clientId and guests.
- Inside Discord only same-origin requests work, through Discord's proxy. Keep every asset and API call on this origin, and open external links with the SDK's openExternalLink (app.js intercepts target=_blank links).

## Rules conventions

Classic has 11 tiles per player. Each enabled expansion adds one tile to each reserve. Original rules permit opening with the Queen. Queen placement is required by a player's fourth turn. Threefold repetition and simultaneous surrounds draw.

Mosquito cannot copy another Mosquito, including a stacked one; an elevated Mosquito moves as a Beetle. Ladybug travels over two occupied spaces then down to empty. Pillbug carries only unstacked adjacent bugs, cannot carry the last moved/placed bug, and stuns the carried bug for the next turn. Carrying must respect connectivity and elevated gates. A ground Mosquito may copy an adjacent uncovered Pillbug's carry.

Undo is host-configurable in the lobby, author-only, once for two seconds after the latest move and before another move. Undo must restore scores as well as board state. Bot replies wait beyond that window. Timers operate only in online games. Leaving a running online game returns the remaining player to the lobby without awarding a win.

## Interface and assets

Preserve the established earth/pixel visual identity. Tile player colours are pale and dark green; the inner outline represents species. Keep reserve stacks countable, letters inside the intact tile border, legal destinations dashed, and special actions above the reserve. Use the existing icon system and bundled artwork; do not modify the separate Birdcard project.

Bug artwork lives in public/art/, font in public/fonts/, and sound in public/audio/. Bug art is vector pixel art: one SVG per bug, one crispEdges path per colour on the art's own pixel grid. Keep images as SVG rather than adding raster files. Preserve the audio and font license notices. Do not commit local screenshots, credentials, .env files, dependencies, or temporary browser data.

## Validation

Run npm test for rules, table, or server changes. For visual changes, check the affected screen in a browser at desktop and narrow widths as appropriate. Keep tests focused on meaningful behavior; avoid tests that merely duplicate styling.
