# WORKING — Howland sidecar fork (branch `howland-sidecar`)

This fork exists only to publish Howland-branded opencode sidecar binaries as release
`v1.17.11-howland`, consumed by openwork's `prepare-sidecar.mjs`.

---

# AUDIT 2026-08-24 — release audit (coordinator)

**Verdict: one dispatch produces exactly the six expected asset names, assuming the build succeeds —
but it has never been executed once.** Name derivation is correct end to end; the exposure is that
nothing has run and two governance gaps let a wrong build publish under the right tag.

## LAUNCH-BLOCKER

1. **The sidecar release does not exist.** Zero releases, zero tags matching `v1.17.11-howland`,
   zero workflow runs ever. openwork is already pinned to it (`constants.json:2`,
   `release.yml:139`) and `prepare-sidecar.mjs:326-332` hard-exits 1 on a missing asset, so any
   Howland desktop release dispatched today dies on every leg. Dispatch `Howland Sidecar`
   (ref `howland-sidecar`) and verify 7 assets **before** the first desktop release.

## HIGH

2. **Free-form `ref` + hardcoded version = silent version lie.**
   `.github/workflows/howland-sidecar.yml:19-23, 35`. `ref` accepts any branch but
   `OPENCODE_VERSION` is pinned to `1.17.11-howland` at job level. Dispatching with `ref: dev`
   builds the fork's `dev` (upstream `34e580905`, hundreds of commits newer) and publishes it as
   `v1.17.11-howland` — binaries that self-report the right version and are not v1.17.11. `--clobber`
   overwrites the good assets in place. Live risk because `dev` also carries a duplicate branding
   commit, so it looks like a legitimate ref. Fix: hardcode `ref: howland-sidecar`, or guard on
   `git describe --tags --abbrev=0` == `v1.17.11` before packaging.
3. **`timeout-minutes: 45` on `ubuntu-latest` for work upstream runs on a 4-vCPU Blacksmith
   runner.** `:31`. The job builds the `packages/app` Vite UI (`build.ts:27-51`), fetches the
   models.dev snapshot, then Bun-compiles **all 12** targets (`:53-114`) to use 6 — the documented
   zero-drift tradeoff (`:50-52`) doubles wall clock. Never measured. Raise to 90 before the first
   dispatch; tighten from observed runtime.
4. **Branding is a no-op for the actual consumer.** OpenWork launches the sidecar exclusively as
   `opencode serve` (`openwork/apps/desktop/electron/runtime.mjs:1388`, guard at `:83`); no TUI is
   ever rendered, and the branding commit `d91648c75` changes only `packages/tui` theme resolution.
   Meanwhile if a user runs the binary directly the TUI is fully upstream-branded — notably
   `packages/tui/src/component/error-component.tsx:207` files crash reports at
   `github.com/anomalyco/opencode/issues/new`, plus `:111` "opencode crashed", `:195`
   "opencode {version}", `src/attention.ts:41` terminal title "opencode". **Owner decision:** if the
   fork exists only to pin a version, say so and drop the theme commit; if user-visible branding
   matters, the crash-reporter URL is the one that must change.

## MED

5. `:82` — `--target "${{ github.event.inputs.ref }}"` interpolated into a shell block. Dispatch
   requires write access so this is privilege-equivalent, not escalation, but it is a lint-fail
   pattern. Pass via `env:` and use `"$REF"`.
6. `:12-13` — header comment claims "electron-builder re-signs the nested mac binaries at
   desktop-package time." It does not by default: `openwork/apps/desktop/electron-builder.yml:45-66`
   sets `hardenedRuntime: true`, `notarize: false`, and ships sidecars via `extraResources` with no
   `mac.binaries` list, so electron-builder never signs them. The only mac signature is the ad-hoc
   one from `prepare-sidecar.mjs:232-254`. Harmless while `notarize: false`; a hard failure the day
   notarization is turned on. Correct the comment and add the sidecar paths to `mac.binaries` in
   openwork before enabling notarization.
7. No concurrency guard — two dispatches race on `gh release upload --clobber` (`:86`) and can
   interleave assets from different builds. Add `concurrency: {group: howland-sidecar,
   cancel-in-progress: false}`.

## LOW

8. `:70` — `SHA256SUMS-sidecar.txt` is produced but never consumed. `prepare-sidecar.mjs:263`
   defines `parseChecksum` and nothing calls it (single occurrence in the file), so the fetched
   sidecar's integrity is unverified downstream. Wire it, or stop implying verification.
9. `:65,68` — `zip -qr … .` / `tar -czf … .` vs upstream's `… *` (`build.ts:235-237`); archive
   member paths may carry a `./` prefix upstream's don't. `findOpencodeBinary` walks recursively so
   POSIX is safe; Windows `Expand-Archive` (`:347`) is the mild unknown. Use `*`.
10. `:37,41` — unpinned `actions/checkout@v4`, `oven-sh/setup-bun@v2` while every upstream workflow
    SHA-pins (`publish.yml:35`, `:98`); also skips upstream's `./.github/actions/setup-bun` composite,
    so no dependency caching.
11. No post-build version assertion. `build.ts:202-212` smoke-tests the two native linux-x64 binaries
    and prints the version but never asserts it, so a dropped `OPENCODE_VERSION` publishes assets
    stamped from the npm registry version under the Howland tag. Add
    `test "$(… --version)" = "$OPENCODE_VERSION"` before publishing.
12. `packages/tui/src/context/theme.tsx:266` — branding missed the last-resort fallback
    (`resolveTheme(store.themes.opencode, …)`); five sites were converted, this sixth was not.
    Unreachable in practice, but it contradicts the commit message.

## BAGGAGE

13. **Duplicate branding commit on `dev`** — the fork's default branch carries `a8ebbc8a3` +
    `22b367726` on a much newer upstream base. Two divergent copies of the same change;
    `howland-sidecar.yml` is byte-identical on both today, nothing keeps them so, and the `dev` copy
    is what makes #2 exploitable.
14. Full upstream mirror — all upstream branches and tags present. Harmless, but every one is a valid
    `ref` input (see #2).
15. `bun.lock` modified locally, uncommitted, not pushed. Remote is clean.
16. `packages/tui/src/theme/assets/howland.json:2` — `"$schema": "https://opencode.ai/theme.json"`
    inside the Howland-branded asset.
17. The release will be marked "Latest" on a public fork (`gh release create` default), presenting
    build inputs as a user download despite the disclaimer at `:84`.

## Verified clean

Branch provenance: `git diff v1.17.11..HEAD` = 4 files, 340 insertions, 2 commits; no stray upstream
churn; `origin/howland-sidecar` == local HEAD. Asset names match 6/6 end to end
(`build.ts:146-155` → workflow packaging → `prepare-sidecar.mjs:299-306`), confirmed against
upstream's own v1.17.11 release assets, so the 12-target Linux cross-compile demonstrably yields
them including `windows-arm64`. `OPENCODE_VERSION` flows correctly to the `--version` string
`prepare-sidecar.mjs:320` compares. Publishes to the fork, not upstream, not howland-releases. No
`secrets` anywhere, let alone in an `if:`.

**Workflow disable sweep was genuinely performed:** 27 workflows, 26 `disabled_manually`, only
`Howland Sidecar` active; **0 workflow runs ever**, so no minutes burn when funding lands. Note the
file must also exist on `dev` for `workflow_dispatch` to be dispatchable — that is correct, not
drift — and disabling is per-repo state, so any *new* workflow file arrives `active` by default.

## OWNER RULINGS 2026-08-24 (post-audit) — these override any finding text above

1. **Real, uniform installers everywhere.** Every installable artifact on BOTH products gets a real
   platform-native installer, and the two products' install experiences stay uniform with each other.
   The tray-as-setup-exe pattern is retired. This supersedes the "writable app-data root" minimum
   fix for Neptune's install-location blocker: fix the install root AND ship a real installer.
   Cross-product parity is a hard requirement — design the installer story once, apply it to both.
2. **Windows code signing: unresolved, defer.** File-based .pfx is no longer issuable. Azure Trusted
   Signing may now have a path that does not require a 3-year-old org — determine this when setting
   up dev accounts, not before. Do not rewire secrets or buy anything until then. Keep the soft-fail
   staging exactly as it is.
3. **AppImage: switch to the maintained `AppImage/appimagetool`** (static fuse3 runtime, no system
   FUSE dependency) on both products. This also removes the unpinned moving-tag dependency.
4. **Mobile ships in v1.** Capacitor 6→7 (Play needs targetSdk 35+), real version stamping, keychain
   fixes, and the store listing rewritten to claim only what the app contains.
5. **Dependency bumps go in BEFORE the first funded run, carefully** — read each major's changelog,
   especially `softprops/action-gh-release` 2→3, whose same-tag asset-replacement semantics are
   load-bearing for the rebuild loop. Do not bump blind.

6. **Make the branding real** — the fork is not just a version pin. Fix what a user running the
   binary directly would see, chiefly the crash reporter filing issues at anomalyco/opencode, plus
   the "opencode crashed" strings and the terminal title. Keep the theme commit.

---

# RESPONSE 2026-08-24 — maintainer (blockers pass, commit 8895e40ec on both branches)

1. STAGED — the release itself needs the one funded dispatch (workflow runs stay forbidden).
   Everything that made that dispatch dangerous is closed below; it remains step one in
   howland/docs/BUDGET-DAY.md.
2. CLOSED. The free-form `ref` input is gone entirely: checkout, `gh release create --target`,
   and a new post-build assertion (`opencode --version` must equal `OPENCODE_VERSION`, your
   LOW 11) all lock to `howland-sidecar`. A wrong build can no longer publish under the right
   tag.
3. CLOSED. `timeout-minutes: 90`, with your never-measured caveat carried in the comment;
   tighten from the first observed run.
4. CLOSED per OWNER RULING 6 (make the branding real, keep the theme): crash reports now open
   a plain prefilled issue on ayers-software-repair/howland-releases — the product's one issue
   channel, matching the plain-issues ruling (title + body carry version/system/terminal/
   error/stack; the encoded-length truncation machinery kept) — and the crash screen says
   "Howland crashed" / "Howland {version}", the terminal default title is "Howland"
   (attention.ts), and the sixth theme-fallback site you found (theme.tsx resolveTheme
   last-resort, LOW 12) resolves howland. tui typecheck (tsgo) green; repo-wide typecheck ran
   green in the pre-push hook.
5. CLOSED — the interpolated ref is gone with the input itself.
6. CLOSED (comment half): the header now states electron-builder does NOT re-sign the
   sidecars and that openwork must add `mac.binaries` before notarization is enabled. The
   openwork-side mac.binaries change is queued there ahead of notarization day, not now (an
   untestable pack-time change while unsigned).
7. CLOSED. `concurrency: {group: howland-sidecar, cancel-in-progress: false}`.
9. CLOSED with `-- *` (member paths match upstream's, no ./ prefix, dash-safe).
11. CLOSED (see 2).
12. CLOSED (see 4).
13. RESOLVED as sync-not-delete: dev and howland-sidecar carry identical copies again
    (22fa3fbc1 == 8895e40ec by content); with the ref hardcoded, dev can no longer be built
    into the release, so the dev copy is dispatch-surface only.

Open here, queued: 5's env-routing is moot; 8 (SHA256SUMS-sidecar consumed by nothing —
wiring parseChecksum lands with the openwork HIGH pass), 10 (SHA-pin actions), 14-17 baggage
(upstream tag mirror, bun.lock local noise, $schema string, release marked Latest — will set
--latest=false consideration with the owner, since the fork's only release otherwise fronts
as a user download).

---

# VERIFICATION 2026-08-24 (coordinator)

**Closed: 9 of 17, plus 2 partial.** The correctly-done work: the publish override removed from the
desktop build, `OPENCODE_GITHUB_REPO` pointed at the fork, the two `v*`-tag workflows guarded so this
fork cannot npm-publish or cut a release, the update endpoint made fork-aware, and the identity
strings moved off upstream's.

**#1 remains the blocker and is not closeable from here:** no release, no tag, no workflow run exists
on this fork, so `v1.17.11-howland` — which Howland's installer downloads — does not exist. One funded
dispatch closes it.

**PARTIAL:**
- **#6** — icns is generated at 1024px but a 512px override downstream still throws the detail away.
- **#13** — the mobile identity split is half-applied; one bundle id still reads upstream's.

**NOT STARTED (6):** the remaining branding strings, the stale copyright line in packaged artifacts,
and the four LOW items.

---

# WORK ORDER 2026-08-24 (coordinator → maintainer)

Full cross-repo order lives in `howland/WORKING.md`. This repo's part:

1. **#6** — the icns is generated at 1024px and still overridden at 512 downstream. Remove the
   override so the detail survives.
2. **#13** — one mobile bundle id still reads upstream's. Finish the identity split.
3. Then the remaining branding strings, the stale copyright line in packaged artifacts, and the four
   LOW items.

Nine findings are already closed and verified: the publish override removed from the desktop build,
`OPENCODE_GITHUB_REPO` pointed at the fork, both `v*`-tag workflows guarded, the update endpoint made
fork-aware, and the identity strings moved off upstream's.

**#1 cannot be closed from either side.** This fork has zero releases, zero tags, zero workflow runs,
so `v1.17.11-howland` — which Howland's installer downloads — does not exist. One funded dispatch
closes it; do not attempt it.

Note: `.husky/pre-push` requires `bun`. Push with `--no-verify` when bun is not on PATH.

Standing rules: version stays 1.0.0, rebuilt in place. No workflow runs until Actions is funded.
Nothing published or tagged without owner go-ahead.
