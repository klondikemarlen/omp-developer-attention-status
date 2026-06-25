# omp-developer-cost-status

OMP plugin that adds a developer-time cost meter to the footer status line.

## Intent

**WHY this plugin exists:** OMP shows model and tool activity, but it does not track what the
developer's own active time costs while they drive a session.

**WHAT this plugin produces:** A footer status segment like `$3.13 (dev)` that stays active after
each prompt and checks for settled 5-minute windows on a configurable cadence.

**Decision Rules:**
- **Prompt-driven billing:** Only user agent prompts start or extend the timer.
- **Five-minute liveness:** Each prompt keeps the meter active for `activeWindowMinutes`.
- **Configurable refresh:** The plugin checks every `refreshIntervalSeconds` for settled windows,
  so teams can slow down the background status update cadence.
- **Settled-window display:** The number changes only after a full active window elapses. It does
  not continuously count up during the active window.
- **Session-scoped meter:** Billing is keyed to the current top-level session id. Resume the same
  session and the meter continues.
- **Top-level only:** Subagent and artifact sessions do not get their own developer meter.
- **Spread billing (spec):** If the user is active in multiple top-level sessions during the same
  time span, the developer cost should be divided across those sessions instead of being
  double-counted.

## Current implementation note

The spread-billing rule above is documented as the intended spec. The current plugin implementation
still tracks each top-level session independently; simultaneous active top-level sessions are
**not** yet shared or prorated.

## Behavior

The plugin writes status via `ctx.ui.setStatus(...)`.

Current OMP limitation:

- plugin status renders on the separate hook-status line below the main prompt status bar
- it does **not** render inline beside the built-in usage/cost segment
- the extra vertical gap belongs to OMP's hook-status layout, not this plugin's text

Display style:

- format: `$3.13 (dev)`
- dim hook-status styling
- checks for newly settled windows every `refreshIntervalSeconds` while the session is active

Billing behavior:

- each prompt keeps billing alive for `activeWindowMinutes`
- only full elapsed windows are committed to saved state and shown in the status line
- the on-screen number does not move before the next full window settles
- if you resume the same session id later, the plugin reloads the last persisted state and keeps
  adding to it
- a new session id starts a new meter

## Defaults

The plugin ships with simple defaults:

- `monthlySalary`: `6500`
- `hoursPerWeek`: `40`
- `weeksPerYear`: `52`
- `activeWindowMinutes`: `5`
- `refreshIntervalSeconds`: `15`
- `label`: `dev`

That yields a default 5-minute developer cost of about `$3.13`.

If you work `49` weeks per year instead, the same defaults produce about `$3.32` per 5-minute
window.

## Formula

```text
windowRate = monthlySalary × 12 / (hoursPerWeek × weeksPerYear × 60) × activeWindowMinutes
```

Default example:

```text
monthlySalary = 6500
hoursPerWeek = 40
weeksPerYear = 52
activeWindowMinutes = 5
refreshIntervalSeconds = 15

windowRate = $3.13
```

49-week example:

```text
monthlySalary = 6500
hoursPerWeek = 40
weeksPerYear = 49
activeWindowMinutes = 5

windowRate = $3.32
```

## Install

From GitHub:

```bash
omp install github:klondikemarlen/omp-developer-cost-status
```

For local development from a checkout:

```bash
git clone git@github.com:klondikemarlen/omp-developer-cost-status.git
cd omp-developer-cost-status
npm install
omp install /absolute/path/to/omp-developer-cost-status
```

Example:

```bash
omp install /home/marlen/code/klondikemarlen/omp-developer-cost-status
```

OMP symlinks a local path install and watches it for changes.

After install, restart OMP if it is already running, or run `/reload-plugins`.

Then run `/developer-cost-status` once to confirm the extension loaded.

## Configure plugin settings

Inspect current settings:

```bash
omp plugin config list omp-developer-cost-status
```

Set a custom salary:

```bash
omp plugin config set omp-developer-cost-status monthlySalary 9000
```

Set custom working time assumptions:

```bash
omp plugin config set omp-developer-cost-status hoursPerWeek 37.5
omp plugin config set omp-developer-cost-status weeksPerYear 49
omp plugin config set omp-developer-cost-status activeWindowMinutes 5
omp plugin config set omp-developer-cost-status refreshIntervalSeconds 10
omp plugin config set omp-developer-cost-status label dev
```

Setting changes are picked up on the next status refresh while a session is active. With the
default settings, that means within about 15 seconds. You only need `/reload-plugins` or a
restart after changing plugin code or install state.

## Status command

```text
/developer-cost-status
```

It shows the current meter total for the active top-level session.

## Development

```bash
npm install
npm test
npm run build
```

## Troubleshooting

- `omp plugin list` should show `omp-developer-cost-status`.
- `omp plugin config list omp-developer-cost-status` should show the current settings.
- The status text is rendered by `ctx.ui.setStatus(...)`, so it appears on OMP's separate
  hook-status line rather than inline beside the built-in usage/cost segment.
