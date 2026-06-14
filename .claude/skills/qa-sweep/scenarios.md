# Scenario catalog — harnext-desktop

Work through these systematically. Each scenario lists the flow plus **watch-for**
hints (bugs and UX issues to actively probe). After each step check console +
network (see SKILL.md). `✓` a scenario in the report when it passes clean.

Routes (HashRouter): `/` open-project · `/project/:id` compose · `.../agent/:id`
· `.../settings` · `.../loops` · `.../loops/new` · `.../loops/:id` · `.../loops/:id/edit`.

---

## 1. Onboarding / first run  *(needs a fresh DB — see SKILL "Clean first-run")*

Flow: Welcome → Theme → Provider+key → Open first project. 4-step stepper.

- Welcome: "Get started" advances; three feature cards render; logo present.
- Theme step: pick Dark/Light → selection highlights (`.on`) and applies live;
  Back returns to Welcome; Continue advances. Stepper dot states (active/done).
- Provider step: provider list loads (`providers.list()`); selecting one marks it
  `on`; paste API key → on blur shows **Saved**; an already-authenticated provider
  shows **Connected** with no key typed. Switching provider **must reset
  smart/executor** to valid models for the new provider (regression area — see
  Settings #9). Continue with an empty key should still proceed.
- Project step: `ProjectPicker` opens a directory dialog; choosing a folder
  finishes onboarding and routes to `/project/:id`.
- "**Skip setup**" finishes onboarding with no project → routes to `/`.
- Titlebar buttons in onboarding: minimize, close.
- Watch-for: can you get stuck (no Back on welcome is fine, but Continue always
  available?); does Skip set `onboarded:true` so it doesn't reappear; key stored
  but never shown back in plaintext; empty/garbage key handling; rapid Continue
  double-advance; stepper count matches steps (4).

## 2. Window chrome / titlebar  *(frameless window, `frame:false`)*

- Drag region moves the window; double-click behavior.
- Minimize / maximize / close buttons work (`window.api.win.*`).
- Min window size is 940×600 — resize down to the floor and check layout doesn't
  break or clip controls; resize wide.
- Project switcher dropdown in titlebar lists projects and switches; current
  project shown; Settings active state reflects route.
- Watch-for: icon-only buttons need accessible names/titles; close on the only
  window quits app (non-darwin); maximize toggles restore correctly.

## 3. Projects

- `/` open-project page: empty state when no projects; recent-projects picker.
- Add a project via the directory dialog. Use a **git repo** and separately a
  **non-git folder** — `Project.isGit`/`branch` differ; compose eyebrow shows
  `branch ?? name`.
- Re-adding the same path (UNIQUE path constraint) — graceful, no crash/dupe.
- Switch between projects (titlebar); `lastOpenedAt` ordering of recents.
- Remove a project — confirm it disappears and cascades (agents/loops gone).
- Watch-for: long project names/paths overflow; selecting a now-missing folder;
  no projects after remove → routed sensibly.

## 4. Compose / start agent  (`/project/:id`)

- Textarea autofocuses; placeholder copy.
- Quick-prompt chips fill the textarea ("Fix the failing tests", "Add input
  validation", "Upgrade dependencies", "/goal Ship dark mode end to end").
- Typing `/goal ...` toggles **Goal mode**: badge appears and smart/exec model
  selects replace the single model select. Removing `/goal` reverts.
- Model select(s) persist to settings (`saveSettings`); permission-mode select
  (Auto-accept edits / Plan only / Full access) persists.
- Start: ⌘/Ctrl+Enter or the Start button. Empty/whitespace prompt does nothing.
  Button shows "Starting…" and is disabled mid-start; on success routes to the
  agent detail; on failure an error card shows the message (e.g. missing key).
- Watch-for: double-submit on rapid Enter; model list empty when provider has no
  models (falls back to `[settings.model]`); error card styling/readability;
  very long prompt textarea growth.

## 5. Agent detail & live streaming  (`.../agent/:id`)

- Left sidebar (`AgentsSidebar`) lists agents with **status pills**: Working
  (running) / Review / Needs input / Merged (done) / Failed / Paused. Verify each
  state renders with correct label+color (`StatusPill`).
- Timeline streams: user/plan/exec/eval messages and tool calls (start → end,
  args, result, error styling). Text deltas are throttled (~50ms) — should read
  smoothly, not jump.
- Send a follow-up prompt to a running/input agent (`agents.prompt`).
- Abort a running agent (`agents.abort`) → status → Paused.
- Switch between agents in the sidebar; timelines don't bleed across agents
  (keyed by agentId).
- Restart the app: past conversations replay **read-only** (known: no resume).
- Watch-for: empty timeline state; tool-call result truncation/overflow; error
  tool calls clearly marked; progress text updates; many agents → sidebar scrolls;
  switching mid-stream doesn't drop events.

## 6. Worktree diff & review

- For a git project, a running/finished agent has a worktree on `agent/<slug>`.
- Diff view renders files with badges (new/mod/del), per-file +add/−del counts,
  and hunks with ctx/add/del line coloring (`WorktreeDiff`/`DiffFile`).
- **Approve & merge** (`agents.merge`) merges into the checkout and refreshes
  agent list/status (→ Merged). **Discard** (`agents.discard`) removes the
  worktree. **Open editor** (`agents.openEditor`) launches the configured editor.
- Non-git project: no worktree — verify the UI handles "nothing to review".
- Watch-for: large diffs render/scroll OK; empty diff state; merge conflict /
  failure surfaces an error rather than silently failing; add/del totals match.

## 7. Goal mode (evaluator loop)

- Start a prompt with `/goal`. Roles plan (smart) and exec (executor) appear;
  eval messages carry a verdict (`approve`/`revise`) — rendered distinctly.
- Loop continues on `revise`, stops on `approve`.
- Watch-for: smart/exec model labels correct; verdict badges clear; the loop's
  progress is legible; settings `evalLoop`/model choices respected.

## 8. Loops (scheduled runs)  (`.../loops`)

- LoopsHome: list of loops with cadence text, status (active/paused), runs count,
  last/next run times (relative time via `useNow`); empty state.
- New loop (`/loops/new`): title, prompt, and type **interval / daily / weekly**:
  - interval → `intervalHours`; daily → `time` "HH:MM"; weekly → `time` + `day`
    (0=Mon … 6=Sun). Cadence string reflects the config.
  - Validation: blank title/prompt, bad time format, zero/negative interval.
- Create → appears in list. Edit (`/loops/:id/edit`) preserves values. Toggle
  pause/resume (`loops.toggle`). **Run now** (`loops.runNow`) triggers a run.
- Loop detail (`/loops/:id`): run history (`LoopRun`: status done/failed/review,
  add/del, summary, time). Delete a loop.
- Watch-for: next-run computation sane vs current time; relative-time ticks/
  updates; cadence copy matches selected schedule; deleting/editing while a run
  is in flight; timezone of "HH:MM".

## 9. Settings  (`.../settings`)

- Default model, **smart** model, **executor** model selects; provider keys
  (save per provider); default editor; appearance (dark/light, live); toggles
  `openOnDone`, `evalLoop`.
- **Provider switch reconciliation** (recently fixed, regression-prone): changing
  provider must reset model/smart/executor to that provider's valid models — never
  leave them pointing at the previous provider's IDs. Verify in Settings *and*
  onboarding *and* Compose stay consistent.
- Persistence: change settings → restart app → values retained (SQLite).
- Watch-for: saving a key gives feedback; switching provider with a custom model
  selected; selects show the current value even if not in the provider list
  (ModelSelect prepends unknown current value).

## 10. Theming (dark / light)

- Toggle theme; `documentElement.dataset.appearance` updates; every view legible
  in both. Spot-check onboarding, compose, agent detail, diff, loops, settings.
- Watch-for: hardcoded colors that don't adapt; low contrast text (`--tx-2`,
  amber accents) on the other theme; focus rings visible in both.

## 11. Error & edge states

- Start agent with **no provider key / no auth** → clear error, no crash.
- Provider/network failure mid-run → agent → Failed with a readable error.
- Navigate to an invalid route (e.g. `#/nope`) → redirect to `/`.
- Very long titles/prompts/paths → ellipsis/wrap, no layout break.
- Rapid clicks / double submits on Start, Merge, Run-now, toggles → no duplicate
  actions or state desync.
- Offline / `../harnext` core not built (only relevant pre-launch).

## 12. Console & performance hygiene

- Steady state (idle on each main view) → `list_console_messages` is clean: no
  errors, no React warnings (missing keys, controlled/uncontrolled), no unhandled
  rejections.
- `list_network_requests` → no failed/4xx/5xx; assets/fonts load.
- Navigate around for a while → no runaway listeners or growing memory
  (`take_heapsnapshot` / `performance_start_trace` spot check if suspicious).
- Watch-for: repeated identical IPC calls (re-render storms), event listeners not
  cleaned up (`onAgentEvent` returns an unsubscribe — verify it's used).

## 13. Accessibility

- Keyboard: Tab order is logical; all interactive controls reachable; selects and
  buttons operable by keyboard; `:focus-visible` rings present.
- Icon-only buttons (titlebar min/close, quick chips, composer start) have
  accessible names/titles.
- Color contrast meets a reasonable bar in both themes.
- No keyboard traps; Esc/close behaviors sensible.

---

### Suggested order
1) Onboarding (fresh DB) → 2) titlebar → 3) projects → 9) settings →
4) compose → 5) agent (scratch repo, tiny prompt, abort early) → 6) diff →
7) goal → 8) loops → 10) theming → 11) edges → 12) console → 13) a11y.

Keep findings flowing into the report as you go rather than batching at the end.
