# BugTile Rip-off

A two-player browser game inspired by Hive: a little bug chess, one patch of earth, two colonies. Play online with a friend, share a screen in hot-seat mode, or face a local bot. Includes Classic rules and the optional Mosquito, Ladybug, and Pillbug expansions.

Working on the code, or pointing a coding agent at it? Start with [CLAUDE.md](CLAUDE.md).

## Play locally

Requires **Node.js 22+**. No package installation or build step is needed.

```sh
git clone https://github.com/lazar-milin/bugtile-ripoff.git
cd bugtile-ripoff
npm start
```

Open **http://127.0.0.1:3007**. On Windows you can also double-click **Start BugTile Rip-off.cmd**. Keep the server running while playing. Set `PORT` to use a different port.

For two-player testing, open two tabs. Each tab keeps its own seat in session storage. Friends on the same network can use the LAN address printed by the server; internet play requires running this Node server on a host reachable by both players. GitHub hosts the source code, not a running game server.

## Tables and controls

- Choose a name, create a table, join with an eight-character code, or select an open table. Codes accept either case. Blank names become random colour + bug names.
- The host, marked by a gold gem, chooses Online play, Hot-seat play, or Local game against a bot. Expansions can be enabled independently and combined.
- Online hosts can choose a turn timer. An expired timer makes a legal move automatically. Hot-seat and bot games have no timer.
- The host can enable or disable Undo before starting. When enabled, your latest move can be undone once within two seconds, until another move happens. The bot waits for this window before replying.
- The header provides rules help, sound controls, the game log, table scores, and Leave table. Wins and draws carry across rematches. Online rematches require both players.
- Refreshing keeps your seat; choose **Return to your table**. Leaving an unfinished online game returns the remaining player to the lobby and transfers host when needed. The last person leaving closes the table.

## Rules and expansions

Classic provides 11 tiles per player. The engine enforces queen placement by the fourth personal turn, one-hive connectivity, sliding gates, beetle stacks, forced passes, simultaneous surrounds, and threefold repetition. The original opening rule allows placing the Queen first.

Firefly (`F`) takes exactly three sliding steps without revisiting a space. Each player has two. Its tail alternates between the supplied lit and unlit artwork at independent random intervals of 2–20 seconds; the light is cosmetic and does not affect movement.

Each enabled expansion adds one tile per player:

- **Mosquito:** copies adjacent non-Mosquito movement abilities, including the Pillbug carry. While on top of the hive it moves as a Beetle.
- **Ladybug:** exactly two steps over occupied spaces, then one step down to an empty space, respecting elevated gates.
- **Pillbug:** one sliding step, or carries an adjacent single bug over itself to an empty neighboring space. The last moved or placed bug cannot be carried. A carried bug cannot move on the next turn. Stacks, blocked gates, and moves that split the hive are prohibited.

To carry, select a Pillbug or eligible Mosquito, choose **Carry a bug** above the reserve, select a highlighted neighbor, then choose a dashed destination. The in-game guide explains all bug movements.

Rules references: [publisher's Mosquito page](https://www.gen42.com/product/mosquito-expansion/) and [Hive rulebook](https://hivegame.com/download/rules.pdf).

## Validation

```sh
npm test
```

Tests cover the base rules, all three expansions, table lifecycle, names, timers, undo, scoring, rematches, and two-client HTTP play.

## Artwork and sound

Bug illustrations are supplied project artwork in `public/art/`. The VCR OSD Mono font, pixel interface icons, and sound cues follow [Birdcard Rip-off](https://github.com/lazar-milin/birdcard-ripoff). Sound cues come from Kenney's CC0 Interface Sounds; their license is retained in [public/audio/LICENSE.txt](public/audio/LICENSE.txt).

Code follows Birdcard's GPL-3.0 licensing; see [LICENSE](LICENSE). Third-party assets retain their own terms.

## Prototype limits

Tables are held in memory by a single server process, expire after 24 hours of inactivity, and disappear on restart. The bot uses a lightweight heuristic. There are no accounts, persistent scores, spectators, or Discord integration.

Hive was created by John Yianni and published by Gen42. This is an unofficial fan-made prototype.
