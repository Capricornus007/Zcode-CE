// Modified by ZCode: 搬自上游 zai-org/ZCode aac47556 (Apache-2.0);插件 UI 沙箱(F5),与上游一致,仅随本仓 shared/构建入口路径调整。
import type { PluginSandboxRegistryPort } from "./contract.js";
import { buildPluginSandboxPartition, buildPluginSandboxShellUrl } from "./contract.js";

/** host 登记后 main 返回给 host 的句柄应满足的派生规则。 */
export function exampleRegister(registry: PluginSandboxRegistryPort) {
  const serverName = "plugin:example-plugin:widget";
  const handle = registry.register({
    instance: {
      runtimeId: "example",
      generation: 1,
      token: "example",
      appIdentity: "a".repeat(64),
    },
    ownerWebContentsId: 1,
    workspacePath: "/repo",
    sessionId: "session_1",
    pluginId: "example-plugin@example-marketplace",
    serverName,
    scopeId: "tool:call_1",
    html: "<!doctype html><p>widget</p>",
    csp: { connectDomains: ["https://api.example.com"] },
    cspRelaxations: { wasmUnsafeEval: true },
  });
  return {
    handle,
    shellUrlMatches:
      handle.shellUrl === buildPluginSandboxShellUrl(handle.sandboxId, handle.instance.appIdentity),
    // partition 由 Agent 可信身份派生；相同身份跨实例稳定。
    partitionMatches:
      handle.partition ===
      buildPluginSandboxPartition({ appIdentity: handle.instance.appIdentity }),
  };
}
