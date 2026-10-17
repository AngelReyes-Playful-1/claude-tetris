# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Vanilla JS Tetris on HTML5 Canvas. No dependencies, no `package.json`, no build, no linter, no tests. Three files: `index.html` (DOM + canvases), `style.css` (dark/retro theme), `game.js` (all logic). UI text and README are in Spanish — keep user-facing strings in Spanish.

## Running

Open `index.html` directly, or serve statically (preferred):

```bash
python -m http.server 8000   # then http://localhost:8000
```

Verification is manual in the browser.

## Architecture (`game.js`)

- **Global mutable state** in top-level `let` vars (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, …). `init()` resets all of them; the restart button calls `init()`.
- **Board**: `ROWS × COLS` matrix; cell = `0` (empty) or piece type index `1–8` (7 standard tetrominoes + 8 = "tuerca", a 3×3 ring with an empty center). The same index keys into `PIECES` (shape matrices, cells hold the type index) and `COLORS` (index 0 is `null`).
- **Piece**: `{ type, shape, x, y }`. Rotation = `rotateCW` (transpose + reverse) via `tryRotate`, which tries kicks `[0, -1, 1, -2, 2]` columns. `collide(shape, ox, oy)` is the single collision check used by movement, rotation, gravity, ghost and spawn.
- **Piece lifecycle**: `lockPiece()` → `merge()` → `clearLines()` (updates score/lines/level/`dropInterval`) → `spawn()` (promotes `next`, rolls new `next`, calls `endGame()` if spawn collides, redraws preview).
- **Loop**: `requestAnimationFrame(loop)` accumulates `dt` into `dropAccum`; gravity step when it exceeds `dropInterval`. `draw()` redraws everything each frame (grid → board → ghost at alpha 0.2 → current). Preview canvas only redraws in `drawNext()` on spawn.
- **Scoring**: `LINE_SCORES[n] * level`; soft drop +1/row, hard drop +2/row. Level = `floor(lines/10)+1`; `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Pause / game over** share one overlay (`#overlay`, toggled via `.hidden` class), with title/score text set from JS.

## Gotchas

- Changing `COLS`, `ROWS` or `BLOCK` requires updating `<canvas id="board">` `width`/`height` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`). Next-preview canvas assumes a 4×4 grid of 30px (`drawNext`, 120×120 canvas).
- Controls are listed in three places: `keydown` handler in `game.js`, the controls list in `index.html`, and the README table — keep them in sync.
