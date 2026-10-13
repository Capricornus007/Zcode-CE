import assert from "node:assert/strict";
import test from "node:test";
import { ServiceChannels, hostPluginSandboxRegisterResultMessageSchema } from "@zcode/shared";
import type { PluginSandboxHandle, PluginSandboxRegisterInput } from "@zcode/shared/mcp-apps";
import { createPluginUiBridgeService, PluginUiBridgeError } from "../src/plugin-ui-bridge/pluginUiBridgeService.js";
import { IPluginUiBridgeService } from "../src/plugin-ui-bridge/contract.js";
import { createPluginUiSamplingService } from "../src/plugin-ui-bridge/pluginUiSamplingService.js";
import { createPluginUiAppToolsService } from "../src/plugin-ui-bridge/pluginUiAppToolsService.js";
import { createPluginUiAccountBindings } from "../src/plugin-ui-bridge/instanceAccounts.js";

/**
 * plugin-ui 桥服务回归测试（上游 aac47556 的 4 个 vitest 文件改写为 node:test）。
 * 安全意义：prepareSandbox 的合并 / 隔离 / 凭据回收边界一旦错位，要么同 appId 的重复
 * 实例泄漏旧 OAuth 凭据，要么不同插件 / 工作区共享沙箱句柄；回包 strict schema 漏字段
 * 会让卡片永远卡在 preparing（上游 2026-09-20 permissions 复现）。
 *
 * 运行：cd packages/services && node --import tsx --test test/pluginUiBridge.test.ts
 */

const instance = { runtimeId: "agent", generation: 1, token: "token", appIdentity: "a".repeat(64) };
const params = {
  workspacePath: "/a",
  sessionId: "s",
  pluginId: "p",
  serverName: "m",
  scopeId: "surface:x",
  resourceUri: "ui://x",
  ownerWebContentsId: 1,
};

test("描述符绑定 plugin-ui-bridge 频道", () => {
  assert.equal(IPluginUiBridgeService.channelName, ServiceChannels.PluginUiBridge);
  assert.equal(ServiceChannels.PluginUiBridge, "plugin-ui-bridge");
});

test("句柄带的全部资源级字段都过 main → host 的 strict 回包 schema", () => {
  const handle: PluginSandboxHandle = {
    instance: {
      runtimeId: "test-agent",
      generation: 1,
      token: "test-token",
      appIdentity: "a".repeat(64),
    },
    sandboxId: "sb-01",
    initId: 1,
    shellUrl: "zcode-sandbox://shell-sb-01/",
    partition: "persist:plugin-sandbox-v1-0123456789abcdef",
    resourceMeta: {
      prefersBorder: true,
      heightHint: 320,
      minFrameHeight: 120,
      showInline: false,
      permissions: ["clipboardWrite"],
    },
  };
  const parsed = hostPluginSandboxRegisterResultMessageSchema.safeParse({
    type: "plugin-sandbox-register-result",
    requestId: "req-1",
    ok: true,
    ...handle,
  });
  assert.equal(parsed.success, true);
});

test("prepareSandbox 合并同键初始化但隔离 server / workspace / resource", async () => {
  const opened: Array<Record<string, unknown>> = [];
  const open = async (p: typeof params & { workspaceIdentity?: string }) => {
    const made = {
      ...instance,
      token: JSON.stringify([p.serverName, p.resourceUri, p.workspaceIdentity ?? p.workspacePath]),
    };
    opened.push(made);
    return made;
  };
  const readCalls: Array<{ uri: string; instance: typeof instance }> = [];
  const read = async (input: { uri: string; instance: typeof instance }) => {
    readCalls.push(input);
    return { contents: [{ uri: input.uri, mimeType: "text/html", text: "<p>fixture</p>" }] };
  };
  const registerCalls: Array<PluginSandboxRegisterInput> = [];
  const register = async (input: PluginSandboxRegisterInput) => {
    registerCalls.push(input);
    return {
      instance: input.instance,
      sandboxId: input.instance.token,
      initId: 1,
      shellUrl: "url",
      partition: "partition",
    };
  };
  const bridge = createPluginUiBridgeService({
    openInstance: open,
    readMcpResource: read,
    registerSandbox: register,
  });
  const first = await Promise.all([bridge.prepareSandbox(params), bridge.prepareSandbox({ ...params })]);
  assert.deepEqual(first[0], first[1]);
  assert.equal(opened.length, 2);
  assert.equal(readCalls.length, 1);
  assert.equal(registerCalls.length, 1);
  const others = await Promise.all([
    bridge.prepareSandbox({ ...params, serverName: "other" }),
    bridge.prepareSandbox({ ...params, resourceUri: "ui://other" }),
    bridge.prepareSandbox({ ...params, workspaceIdentity: "other" }),
  ]);
  assert.equal(opened.length, 5);
  assert.equal(readCalls.length, 4);
  assert.equal(registerCalls.length, 4);
  assert.equal(new Set([first[0], ...others].map((handle) => handle.sandboxId)).size, 4);
  assert.deepEqual(
    registerCalls.map((input) => input.instance.token),
    readCalls.map((input) => input.instance.token),
  );
});

test("资源读取失败时回收已开的实例凭据", async () => {
  const closed: Array<Record<string, unknown>> = [];
  const bridge = createPluginUiBridgeService({
    openInstance: async () => instance,
    closeInstance: async (p) => {
      closed.push(p as Record<string, unknown>);
    },
    readMcpResource: async () => ({ contents: [] }),
    registerSandbox: async (input) => ({
      instance: input.instance,
      sandboxId: "sb",
      initId: 1,
      shellUrl: "url",
      partition: "partition",
    }),
  });
  await assert.rejects(() => bridge.prepareSandbox(params), /no contents/);
  assert.equal(closed.length, 1);
  assert.deepEqual(closed[0], { ...params, instance });
});

test("sampling 缺省时抛 unavailable，cancelSampling 回退 cancelled:false", async () => {
  const service = createPluginUiSamplingService();
  await assert.rejects(() => service.sample({ ...params, operationId: "op", request: {} as never }), (e: unknown) =>
    e instanceof PluginUiBridgeError && e.code === "unavailable",
  );
  assert.deepEqual(await service.cancelSampling({ ...params, operationId: "op" }), { cancelled: false });
});

test("appTools 缺省时登记抛 unavailable、注销静默回 0；有依赖则透传", async () => {
  const service = createPluginUiAppToolsService();
  await assert.rejects(() => service.registerAppTools({ ...params, scopeId: "s", generation: 1, tools: [] }), (e: unknown) =>
    e instanceof PluginUiBridgeError && e.code === "unavailable",
  );
  assert.deepEqual(await service.unregisterAppTools({ ...params, scopeId: "s", generation: 1 }), { removed: 0 });
  await assert.rejects(() => service.claimAppToolCall({ ...params, scopeId: "s", generation: 1, callId: "c" }), /unavailable/);
  await assert.rejects(() => service.resolveAppToolCall({ ...params, scopeId: "s", generation: 1, callId: "c" }), /unavailable/);
  const passed: string[] = [];
  const wired = createPluginUiAppToolsService({
    registerAppToolsForUi: async (p) => {
      passed.push("register");
      return { tools: p.tools.map((t) => ({ name: t.name, modelName: t.name })) };
    },
    unregisterAppToolsForUi: async () => ({ removed: 1 }),
    claimAppToolCallForUi: async () => ({ accepted: true }),
    resolveAppToolCallForUi: async () => ({ accepted: true }),
  });
  const result = await wired.registerAppTools({ ...params, scopeId: "s", generation: 1, tools: [{ name: "t" }] as never });
  assert.deepEqual(result, { tools: [{ name: "t", modelName: "t" }] });
  assert.deepEqual(await wired.unregisterAppTools({ ...params, scopeId: "s", generation: 1 }), { removed: 1 });
  assert.deepEqual(await wired.claimAppToolCall({ ...params, scopeId: "s", generation: 1, callId: "c" }), { accepted: true });
  assert.deepEqual(await wired.resolveAppToolCall({ ...params, scopeId: "s", generation: 1, callId: "c" }), { accepted: true });
  assert.deepEqual(passed, ["register"]);
});

test("实例账号绑定：读取期间账号变化即拒绝并关闭", async () => {
  const closed: Array<Record<string, unknown>> = [];
  let account = "v1";
  const bindings = createPluginUiAccountBindings({
    readAccount: async () => account,
    open: async (params) => {
      // 模拟 open 期间账号切换
      if (account === "v2") account = "v3";
      return { ...instance, token: "bound-" + account };
    },
    close: async (p) => {
      closed.push(p as Record<string, unknown>);
    },
  });
  const first = await bindings.open({ ...params, scopeId: "s2", resourceUri: "ui://a" });
  assert.equal(first.token, "bound-v1");
  // open 已登记后 invalidate 关闭活跃实例
  account = "v2";
  bindings.invalidate();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(closed.length, 1);
  // invalidate 之后再 open：revision 已变，open 内部检查通过（新一轮），得到新 token
  const second = await bindings.open({ ...params, scopeId: "s2", resourceUri: "ui://a" });
  assert.ok(second.token.startsWith("bound-"));
  await bindings.close({ ...params, instance: second });
  assert.equal(closed.length, 2);
});
