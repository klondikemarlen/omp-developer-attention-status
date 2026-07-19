import type { generateSessionTitle } from "@oh-my-pi/pi-coding-agent/utils/title-generator"

import type { ExtensionApi, ExtensionContext } from "@/extension/types.js"

type SessionTitleGenerator = typeof generateSessionTitle

const loadSessionTitleGenerator: SessionTitleGenerator = async (...args) => {
  const { generateSessionTitle } = await import(
    "@oh-my-pi/pi-coding-agent/utils/title-generator"
  )

  return generateSessionTitle(...args)
}

const activityLabelPrompt = [
  "Generate a concise coarse Project Time activity label for the current user request.",
  "Return only 1 to 48 Unicode letters or numbers, with words separated by a single space or hyphen.",
  "Do not use punctuation, markdown, quotes, file paths, IDs, personal data, credentials, or explanations.",
  "Describe the requested work neutrally and broadly.",
].join(" ")

export async function generateActivityLabel(
  prompt: string,
  ctx: ExtensionContext,
  pi: Pick<ExtensionApi, "pi">,
  titleGenerator: SessionTitleGenerator = loadSessionTitleGenerator,
): Promise<string | undefined> {
  const settings = pi.pi?.settings
  if (ctx.modelRegistry === undefined || settings === undefined) {
    return undefined
  }

  return (await titleGenerator(
    prompt,
    ctx.modelRegistry,
    settings,
    ctx.sessionManager.getSessionId(),
    ctx.model,
    undefined,
    activityLabelPrompt,
  )) ?? undefined
}
