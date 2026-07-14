import { loadDeveloperCostConfigFromFiles } from "./config/loader/load-developer-cost-config-from-files.js";
import { ProjectTimeRuntime } from "./extension/runtime.js";

export { loadDeveloperCostConfigFromFiles };
export default function projectTimeExtension(pi, options = {}) {
  const runtime = new ProjectTimeRuntime(pi, options);
  runtime.register();
}
