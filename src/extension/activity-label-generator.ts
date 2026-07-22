import { resolveActivityCompletionContext } from "@/extension/activity-completion.js"
import { generateActivityNarrative } from "@/extension/activity-narrative-generator.js"
import { parseGeneratedActivityLabel } from "@/time-log/domain/activity.js"
import type { ActivityNarrative } from "@/time-log/domain/narrative.js"
import type { GeneratedActivity, ExtensionContext } from "@/extension/types.js"

const activityLabelPrompt = [
  "Generate a concise coarse Project Time activity label for the current user request.",
  "Return only 1 to 48 Unicode letters or numbers, with words separated by a single space or hyphen.",
  "Do not use punctuation, markdown, quotes, file paths, IDs, personal data, credentials, or explanations.",
  "Describe the requested work neutrally and broadly.",
].join(" ")

type ActivityLabelGenerator = (prompt: string, ctx: ExtensionContext) => Promise<string | undefined>

type ActivityNarrativeGenerator = (
  prompt: string,
  ctx: ExtensionContext,
) => Promise<ActivityNarrative | undefined>

export async function generateActivity(
  prompt: string,
  ctx: ExtensionContext,
  labelGenerator: ActivityLabelGenerator = generateActivityLabel,
  narrativeGenerator: ActivityNarrativeGenerator = generateActivityNarrative,
): Promise<GeneratedActivity> {
  if (ctx.modelRegistry === undefined) return {}

  const [labelResult, narrativeResult] = await Promise.allSettled([
    labelGenerator(prompt, ctx),
    narrativeGenerator(prompt, ctx),
  ])
  const label = labelResult.status === "fulfilled"
    ? parseGeneratedActivityLabel(labelResult.value)
    : undefined
  const narrative = narrativeResult.status === "fulfilled"
    ? narrativeResult.value
    : undefined

  return {
    ...(label === undefined ? {} : { activity: label }),
    ...(narrative === undefined ? {} : { narrative }),
  }
}

async function generateActivityLabel(
  prompt: string,
  ctx: ExtensionContext,
): Promise<string | undefined> {
  const completionContext = await resolveActivityCompletionContext(ctx)
  if (completionContext === undefined) return undefined

  const completion = (await import("@oh-my-pi/pi-ai")).completeSimple
  const response = await completion(
    completionContext.model,
    {
      systemPrompt: [activityLabelPrompt],
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    },
    {
      apiKey: completionContext.apiKey,
      maxTokens: 64,
      disableReasoning: true,
    },
  )

  if (response.stopReason === "error") return undefined

  let text = ""
  for (const content of response.content) {
    if (content.type === "text") text += content.text ?? ""
  }
  return parseGeneratedActivityLabel(text)
}
