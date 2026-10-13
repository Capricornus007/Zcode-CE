// Modified by ZCode: 搬自上游 zai-org/ZCode aac47556 (Apache-2.0);插件 UI 沙箱(F5),与上游一致,仅随本仓 shared/构建入口路径调整。
export * from "./contract.js";
export { buildPluginSandboxCsp, PLUGIN_SANDBOX_SHELL_CSP } from "./csp.js";
export { createPluginSandboxRegistry, PLUGIN_SANDBOX_USER_GESTURE_TTL_MS } from "./registry.js";
export {
  PLUGIN_SANDBOX_PRIVILEGED_SCHEME,
  createPluginSandboxProtocolHandler,
  injectPluginSandboxAliasScript,
  installPluginSandboxProtocol,
  parsePluginSandboxUrl,
} from "./protocol.js";
export {
  attachPluginSandboxGuest,
  configurePluginSandboxGuest,
  isPluginSandboxSrc,
} from "./guestPolicy.js";
export { getPluginSandboxHost, installPluginSandboxHost } from "./host.js";
