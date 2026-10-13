/**
 * 插件 UI 沙箱原生生命周期(F5,移植上游 v3.15.1 vitest 用例)。
 * 运行:cd packages/desktop && node --import tsx --test test/pluginSandboxHostLifecycle.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPluginSandboxPermissionGate } from "../src/main/pluginSandbox/permissionGate.js";
import { createPluginSandboxProtocolHandler } from "../src/main/pluginSandbox/protocol.js";
import { createPluginSandboxRegistry } from "../src/main/pluginSandbox/registry.js";

const input = {
  instance: { runtimeId: "agent", generation: 1, token: "one", appIdentity: "a".repeat(64) },
  workspacePath: "/a",
  sessionId: "s",
  pluginId: "p",
  serverName: "m",
  scopeId: "surface:view",
  ownerWebContentsId: 1,
  html: "<html><head></head><body>one</body></html>",
  permissions: ["camera"],
};

test("lifecycle:共享浏览器响应缓存不能绕过实例授权", async () => {
  const registry = createPluginSandboxRegistry();
  const handle = registry.register({ ...input, permissions: [] });
  const read = createPluginSandboxProtocolHandler({
    registry,
    assets: { rendererDir: "/fixture", aliasDir: "/fixture" },
    readAsset: async () => new TextEncoder().encode("fixture"),
  });
  const plugin = `zcode-sandbox://plugin-${input.instance.appIdentity}/instance/${handle.sandboxId}/`;
  for (const url of [
    handle.shellUrl,
    `${handle.shellUrl}assets/shell.js`,
    `${plugin}index.html`,
    `${plugin}__zcode__/alias.js`,
  ]) {
    const response = await read(new Request(url));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});

test("lifecycle:并发注册不可变,新准备不会被驱逐", () => {
  const registry = createPluginSandboxRegistry({ maxEntries: 1 });
  const a = registry.register({ ...input, permissions: [] });
  assert.deepEqual(registry.register({ ...input, html: "late content", permissions: [] }), a);
  assert.equal(registry.get(a.sandboxId)?.html, input.html);
  assert.throws(() =>
    registry.register({
      ...input,
      instance: { ...input.instance, token: "other" },
      permissions: [],
    }),
  );
  assert.notEqual(registry.get(a.sandboxId), null);
});

test("lifecycle:跨 run 存储稳定,旧 dispose 不影响替换", () => {
  const registry = createPluginSandboxRegistry();
  const a = registry.register({ ...input, permissions: [...input.permissions] });
  const b = registry.register({
    ...input,
    instance: { ...input.instance, token: "two", generation: 2 },
    permissions: [...input.permissions],
  });
  assert.notEqual(a.sandboxId, b.sandboxId);
  assert.equal(a.partition, b.partition);
  registry.dispose(a.sandboxId, a.initId);
  assert.notEqual(registry.get(b.sandboxId), null);
  const c = registry.register({
    ...input,
    instance: { ...input.instance, token: "other", appIdentity: "b".repeat(64) },
    permissions: [],
  });
  assert.notEqual(c.partition, b.partition);
});

test("lifecycle:实例被替换后回来的原生确认必须失效", async () => {
  const registry = createPluginSandboxRegistry();
  const a = registry.register({ ...input, permissions: [...input.permissions] });
  let answer;
  const gate = createPluginSandboxPermissionGate({
    registry,
    prompt: () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  });
  const pending = gate.request({
    permission: "media",
    mediaTypes: ["video"],
    requestingUrl: `zcode-sandbox://plugin-${input.instance.appIdentity}/instance/${a.sandboxId}/index.html`,
    guestUrl: a.shellUrl,
    isCurrent: () => true,
  });
  registry.dispose(a.sandboxId);
  answer(true);
  assert.equal(await pending, false);
});

test("lifecycle:身份与资源 token 双重校验", async () => {
  const registry = createPluginSandboxRegistry();
  const a = registry.register({ ...input, permissions: [] });
  const read = createPluginSandboxProtocolHandler({
    registry,
    assets: { rendererDir: "/unused", aliasDir: "/unused" },
  });
  const good = `zcode-sandbox://plugin-${input.instance.appIdentity}/instance/${a.sandboxId}/index.html`;
  assert.equal((await read(new Request(good))).status, 200);
  assert.equal(
    (await read(new Request(good.replace(input.instance.appIdentity, "b".repeat(64))))).status,
    404,
  );
  registry.dispose(a.sandboxId);
  assert.equal((await read(new Request(good))).status, 404);
});

test("lifecycle:系统授权晚于吊销到达时不保留同意", async () => {
  const registry = createPluginSandboxRegistry();
  const a = registry.register({ ...input, permissions: [...input.permissions] });
  const entered = Promise.withResolvers();
  const system = Promise.withResolvers();
  const gate = createPluginSandboxPermissionGate({
    registry,
    prompt: async () => true,
    requestSystemMediaAccess: () => {
      entered.resolve();
      return system.promise;
    },
  });
  const origin = `zcode-sandbox://plugin-${input.instance.appIdentity}`;
  const pending = gate.request({
    permission: "media",
    mediaTypes: ["video"],
    guestUrl: a.shellUrl,
    requestingUrl: `${origin}/instance/${a.sandboxId}/index.html`,
    isCurrent: () => true,
  });
  await entered.promise;
  registry.dispose(a.sandboxId);
  system.resolve(true);
  assert.equal(await pending, false);
  const b = registry.register({
    ...input,
    instance: { ...input.instance, token: "two" },
    permissions: [...input.permissions],
  });
  assert.equal(
    gate.check({
      permission: "media",
      mediaType: "video",
      guestUrl: b.shellUrl,
      requestingOrigin: origin,
    }),
    false,
  );
});
