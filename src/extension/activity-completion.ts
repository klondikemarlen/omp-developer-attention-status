import type { ExtensionContext } from "@/extension/types.js"

export type ActivityCompletionContext = {
  model: NonNullable<ExtensionContext["model"]>
  apiKey: string
}

export async function resolveActivityCompletionContext(
  ctx: ExtensionContext,
): Promise<ActivityCompletionContext | undefined> {
  const model =
    ctx.model
    ?? ctx.models?.current()
    ?? ctx.models?.resolve("@tiny")
    ?? ctx.models?.resolve("@commit")
    ?? ctx.models?.resolve("@smol")
  if (ctx.modelRegistry === undefined || model === undefined) return undefined

  const sessionId = ctx.sessionManager.getSessionId()
  const apiKey = await ctx.modelRegistry.getApiKey(model, sessionId)
  if (typeof apiKey !== "string" || apiKey.length === 0) return undefined

  return {
    model,
    apiKey,
  }
}
