# Feature request: inline plugin status-line segments

## Problem

This plugin needs to show developer cost in the same place users already look for cost.

Today that does not seem possible through the plugin API.

- `ctx.ui.setStatus(...)` writes to OMP's separate hook-status line
- it does not join the built-in inline cost display
- the Custom status-line preset appears to work from a fixed list of built-in segments, so a plugin cannot add its own segment there

That matches the current user experience here:

- I have not seen this plugin render inline beside the built-in cost text
- enabling the Custom status-line option did not make the plugin appear there either

## Request

Let plugins register their own inline status-line segments in the main status line.

Example shape:

```ts
registerStatusLineSegment({
  id: "developer_cost",
  render(ctx) {
    return {
      content: "$3.33 (dev)",
      visible: true,
    }
  },
})
```

And then allow plugin-defined ids inside:

- `statusLine.leftSegments`
- `statusLine.rightSegments`

## Why

Built-in `cost` and developer cost are different values.

- built-in `cost` = model/tool spend
- developer cost = human active-time spend

Users naturally compare those numbers together, so they should be placeable in the same inline status line.

## Acceptance criteria

- a plugin can register a new inline status-line segment
- users can place that segment in the Custom status-line config
- it renders in the main inline status line, not only the hook-status line below it
- it updates during a session without requiring a custom fork of the whole prompt/footer layout
- disabling or removing the plugin fails cleanly

## Notes

If upstream will not support plugin-defined inline segments, the fallback is likely a fork or a new extension point in the prompt/status renderer.
