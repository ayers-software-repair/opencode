# CLAUDE.md — the Howland opencode fork

This is `anomalyco/opencode` forked (`upstream` remote). Two branches matter:
- **`howland-sidecar`** — upstream v1.17.11 plus the Howland branding commit(s). The
  `howland-sidecar.yml` workflow builds the six sidecar binaries from it and publishes fork
  release `v1.17.11-howland`, stamping SOURCE-COMMIT.txt with the commit it built from
  (openwork's preflight refuses a sidecar whose commit does not match its pin).
- **`dev`** — the fork default; carries only the SYNCED COPY of `howland-sidecar.yml`
  (dispatch reads the workflow list from the default branch). Any workflow edit lands on
  howland-sidecar first, then is synced to dev in a second commit.

The sidecar is a build INPUT for the openwork fork's desktop release, not a user-facing
download — it publishes on THIS fork, never on howland-releases. On success the workflow
chains the openwork desktop build (opt-out via the `chain` input).

Hard rules:
- **Never rename or patch upstream internals** — branding is additive commits on the
  branded branch only (TUI theme, name where it surfaces). A previous fork renamed
  internals and could never take upstream updates again.
- Bun, pinned by the root `packageManager` (the pre-push hook enforces it); `bun typecheck`
  runs from package dirs, never the repo root. Run `bun install` after switching branches
  or the hook fails on stale node_modules.
- Upstream MIT license and notices stay intact everywhere.
- No `schedule:` triggers; every other upstream workflow stays deleted from dev.
- Nothing publishes or dispatches without explicit owner go-ahead. No emojis; no AI
  attribution in commits.

The governing queue, standing rulings and cross-repo record live in
`../howland/WORKING.md` (the howland maintainer session + the coordinator,
ayers-electronics). Report findings and completions there, not here.

## Tooling — the global rules apply here (see ~/.claude/CLAUDE.md)

Two laws from the root file bind every session in this repo. They are not repeated in full here on
purpose: a long CLAUDE.md gets ignored in the middle, so this is a pointer, not a copy.

1. **CONSULT THE DOCS, NEVER GUESS.** Any claim about a library, framework, SDK or platform gets
   read from the real documentation first — `context7` for libraries, `microsoft-docs` for
   .NET/Windows/Azure. Cite the source. Never from memory.
2. **Reach for the tool before the generic one.** `serena` for "where is this symbol used" before
   grep; the LSP for definitions and references; `playwright` for a real browser (this box needs
   `--no-sandbox` and `--mute-audio`).

This repo is **TypeScript** — `typescript-language-server` applies.
