import { parseDeveloperCostConfig } from "../../billing/index.js";
import { PLUGIN_NAME } from "../../config/plugin-name.js";
import { readDeveloperCostConfigFile } from "../../config/loader/read-developer-cost-config-file.js";
import { settingsForPlugin } from "../../config/settings-for-plugin.js";

export async function loadDeveloperCostConfigFromFiles(
  pluginsLockfile,
  projectPluginOverrides,
) {
  const [runtimeConfig, projectOverrides] = await Promise.all([
    readDeveloperCostConfigFile(pluginsLockfile),
    readDeveloperCostConfigFile(projectPluginOverrides),
  ]);
  const globalSettings = settingsForPlugin(runtimeConfig, PLUGIN_NAME);
  const projectSettings = settingsForPlugin(projectOverrides, PLUGIN_NAME);
  const mergedSettings = {
    ...globalSettings,
    ...projectSettings,
  };
  return parseDeveloperCostConfig(mergedSettings);
}

export default loadDeveloperCostConfigFromFiles;
