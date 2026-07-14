import { loadDeveloperCostConfigFromFiles } from "@/config/loader/load-developer-cost-config-from-files.js"
import { ProjectTimeRuntime } from "@/extension/runtime.js"
import type { ExtensionApi, ExtensionOptions } from "@/extension/types.js"

export { loadDeveloperCostConfigFromFiles }
export type { ExtensionApi, ExtensionOptions }

export default function projectTimeExtension(
  pi: ExtensionApi,
  options: ExtensionOptions = {},
): void {
  const runtime = new ProjectTimeRuntime(pi, options)

  runtime.register()
}
