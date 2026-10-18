# CLAUDE.md

This file guides coding agents working in this repository. Read it before changing code. Keep shared project guidance here; AGENTS.md points to this file.

## What this is

A two-player browser game inspired by Hive, with Classic rules and combinable Mosquito, Ladybug, and Pillbug expansions. Plain Node.js 22+, ES modules, no runtime dependencies, no client framework, and no build step. The server serves the committed assets in public/.

## Commands

```sh
npm start                       # http://127.0.0.1:3007; PORT overrides the port
npm test                        # All rules, table, and HTTP tests
node --test tests/rules.test.mjs # One test file
```

Test online play in two tabs: each holds its own seat in sessionStorage. All modes, including hot-seat and bot play, need the server. Do not add an install or build requirement without a concrete need.

## Architecture

- public/engine.js: shared rules engine, species definitions, legal actions, expansion normalization, board helpers, and bot heuristic. initial() creates JSON state; apply() returns a new state and rejects illegal moves. Coordinates use axial hex strings. Preserve one-hive connectivity and height-sensitive sliding gates for every movement and carry.
- table.mjs: authoritative table lifecycle and mutable room transitions. Owns seats, host, game mode, expansion settings, timer, undo window, bot scheduling, rematches, and scores. tableView() returns the client snapshot. Keep authorization and setting validation here rather than trusting the browser.
- server.mjs: Node HTTP adapter, static assets, table codes, bearer seat tokens, and in-memory room storage. The 200ms ticker advances bots and expired timers. /api/move checks the room version to reject stale actions. Exported server can listen on an ephemeral port in tests; importing it must not start a listener.
- public/app.js: DOM rendering, polling, session state, selection, board fitting, controls, and sound. public/index.html and public/style.css define the interface. public/icons.js contains the pixel SVG icon system; public/names.js generates colour + bug names.
- public/fireflies.js: cosmetic per-piece timers for Firefly artwork. Each light switches after a fresh random 2–20 second delay, independent of turns and DOM redraws. public/art/F.png is unlit; F-lit.png is lit. Firefly uses type F, has two tiles per player, and slides exactly three steps without retracing.
- tests/: base rules, expansion edge cases, table transitions, and two-client HTTP integration tests using Node's built-in runner.

Rooms expire after 24 hours without client activity and disappear on restart. Run one server process. No database, account system, external service, or Discord SDK is involved.

## Rules conventions

Classic has 11 tiles per player. Each enabled expansion adds one tile to each reserve. Original rules permit opening with the Queen. Queen placement is required by a player's fourth turn. Threefold repetition and simultaneous surrounds draw.

Mosquito cannot copy another Mosquito, including a stacked one; an elevated Mosquito moves as a Beetle. Ladybug travels over two occupied spaces then down to empty. Pillbug carries only unstacked adjacent bugs, cannot carry the last moved/placed bug, and stuns the carried bug for the next turn. Carrying must respect connectivity and elevated gates. A ground Mosquito may copy an adjacent uncovered Pillbug's carry.

Undo is host-configurable in the lobby, author-only, once for two seconds after the latest move and before another move. Undo must restore scores as well as board state. Bot replies wait beyond that window. Timers operate only in online games. Leaving a running online game returns the remaining player to the lobby without awarding a win.

## Interface and assets

Preserve the established earth/pixel visual identity. Tile player colours are pale and dark green; the inner outline represents species. Keep reserve stacks countable, letters inside the intact tile border, legal destinations dashed, and special actions above the reserve. Use the existing icon system and bundled artwork; do not modify the separate Birdcard project.

Bug artwork lives in public/art/, font in public/fonts/, and sound in public/audio/. Preserve the audio license. Do not commit local screenshots, credentials, .env files, dependencies, or temporary browser data.

## Validation

Run npm test for rules, table, or server changes. For visual changes, check the affected screen in a browser at desktop and narrow widths as appropriate. Keep tests focused on meaningful behavior; avoid tests that merely duplicate styling.
