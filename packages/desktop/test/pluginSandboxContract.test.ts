/**
 * 插件 UI 沙箱契约(F5,移植上游 v3.15.1 vitest 用例)。
 * 运行:cd packages/desktop && node --import tsx --test test/pluginSandboxContract.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { exampleRegister } from "../src/main/pluginSandbox/contract.example.js";
import type { PluginSandboxRegistryPort } from "../src/main/pluginSandbox/contract.js";
import {
  PLUGIN_SANDBOX_PARTITION_PREFIX,
  buildPluginSandboxPartition,
  buildPluginSandboxPluginOrigin,
  buildPluginSandboxShellUrl,
} from "../src/main/pluginSandbox/contract.js";

test("contract:shell 与插件 iframe 落在不同 origin", () => {
  assert.equal(
    buildPluginSandboxShellUrl("sb-1", "trusted"),
    "zcode-sandbox://shell-trusted/instance/sb-1/",
  );
  assert.equal(buildPluginSandboxPluginOrigin("sb-1"), "zcode-sandbox://plugin-sb-1");
});

test("contract:partition 按可信 App 身份派生,所有来源均隔离工作区", () => {
  const plugin = buildPluginSandboxPartition({ appIdentity: "source-a" });
  assert.equal(plugin.startsWith(PLUGIN_SANDBOX_PARTITION_PREFIX), true);
  assert.notEqual(plugin, buildPluginSandboxPartition({ appIdentity: "source-b" }));
  assert.notEqual(
    buildPluginSandboxPartition({ appIdentity: "source-a" }),
    buildPluginSandboxPartition({ appIdentity: "source-b" }),
  );
});

test("contract:示例注册表实现满足派生规则", () => {
  const registry: PluginSandboxRegistryPort = {
    register: (input) => ({
      instance: input.instance,
      sandboxId: input.scopeId,
      initId: 1,
      shellUrl: buildPluginSandboxShellUrl(input.scopeId, input.instance.appIdentity),
      partition: buildPluginSandboxPartition({
        appIdentity: input.instance.appIdentity,
      }),
    }),
    get: () => null,
    dispose: () => {},
    disposeOwner: () => {},
    pin: () => {},
    unpin: () => {},
    markUserGesture: () => {},
    consumeUserGesture: () => false,
  };
  const result = exampleRegister(registry);
  assert.equal(result.shellUrlMatches, true);
  assert.equal(result.partitionMatches, true);
});
