/**
 * Gen UI 资源组合协议(F5,移植上游 v3.15.1 vitest 用例)。
 * 运行:cd packages/desktop && node --import tsx --test test/pluginSandboxGenUiProtocol.test.ts
 */
import assert from "node:assert/strict";
import { basename } from "node:path";
import test from "node:test";

import { createPluginSandboxProtocolHandler } from "../src/main/pluginSandbox/protocol.js";
import { createPluginSandboxRegistry } from "../src/main/pluginSandbox/registry.js";

const fragment = `<html><head><!--__ZCODE_GEN_UI_STYLES__--><script src="__ZCODE_GEN_UI_RUNTIME__"></script></head><body><script>author()</script><!--__ZCODE_GEN_UI_INNER_KIT__--></body></html>`;

function fixture(kind, html = fragment, missing = false) {
  const registry = createPluginSandboxRegistry();
  const instance = { runtimeId: "a", generation: 1, token: "one", appIdentity: "a".repeat(64) };
  const handle = registry.register({
    instance,
    contentKind: kind,
    ownerWebContentsId: 1,
    workspacePath: "/repo",
    sessionId: "s",
    scopeId: "view",
    html,
    ...(kind === "mcp-app" ? { pluginId: "p", serverName: "m" } : {}),
  });
  const resources = {
    "visualize.css": "/* preset styles */",
    "visualize.html": "<!--__INLINE_VISUALIZATION_FRAGMENT__--><script>innerKit()</script>",
    "calendar.js": "calendar()",
    "manifest.json": JSON.stringify({
      resources: [
        { url: "https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js", file: "d3-7.9.0.min.js" },
      ],
    }),
    "d3-7.9.0.min.js": "/* bundled D3 */",
  };
  const readAssetCalls = [];
  // 上游用 vitest mockRejectedValue 热切换读取行为;这里用可换装的行为函数等价实现。
  let readAssetImpl = async (path) => {
    if (missing || !resources[basename(path)]) throw new Error("Missing resource");
    return new TextEncoder().encode(resources[basename(path)]);
  };
  const readAsset = async (path) => {
    readAssetCalls.push(path);
    return readAssetImpl(path);
  };
  const handler = createPluginSandboxProtocolHandler({
    registry,
    assets: { rendererDir: "/renderer", aliasDir: "/runtime" },
    readAsset,
  });
  return {
    readAssetCalls,
    swapReadAsset(impl) {
      readAssetImpl = impl;
    },
    dispose: () => registry.dispose(handle.sandboxId, handle.initId),
    request: (path = "", identity = instance.appIdentity) =>
      handler(
        new Request(`zcode-sandbox://plugin-${identity}/instance/${handle.sandboxId}/${path}`),
      ),
  };
}

test("protocol:仅授权 Gen UI 实例的已注册 vendor 脚本可服务", async () => {
  const genUi = fixture("gen-ui");
  const path = "__zcode__/vendor/d3-7.9.0.min.js";
  const response = await genUi.request(path);
  assert.equal(await response.text(), "/* bundled D3 */");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Content-Type"), "text/javascript; charset=utf-8");
  assert.equal((await genUi.request("__zcode__/vendor/unknown.js")).status, 404);
  assert.equal((await genUi.request("__zcode__/vendor/manifest.json")).status, 404);
  assert.equal((await genUi.request(path, "b".repeat(64))).status, 404);
  assert.equal((await fixture("mcp-app").request(path)).status, 404);
  genUi.dispose();
  assert.equal((await genUi.request(path)).status, 404);
});

test("protocol:声明的 vendor 文件缺失时不回退 CDN", async () => {
  const genUi = fixture("gen-ui");
  await genUi.request("__zcode__/vendor/unknown.js");
  // 热切换成"声明文件缺失"(等价于上游 mockRejectedValue),vendor 请求必须 404,
  // 不能回退 CDN 也不能 500(500 只留给打包 runtime 自身缺失)。
  genUi.swapReadAsset(async () => {
    throw new Error("missing vendor file");
  });
  assert.equal((await genUi.request("__zcode__/vendor/d3-7.9.0.min.js")).status, 404);
});

test("protocol:装载规范 CSS,bridge 在作者脚本前、inner kit 在后", async () => {
  const { request, readAssetCalls } = fixture("gen-ui");
  const response = await request();
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(html.indexOf("preset styles") < html.indexOf("/__zcode__/gen-ui.js"));
  assert.ok(html.indexOf("/__zcode__/gen-ui.js") < html.indexOf("author()"));
  assert.ok(html.indexOf("author()") < html.indexOf("innerKit()"));
  assert.ok(html.indexOf("author()") < html.indexOf('id="zcode-gen-ui-document-scrollbar"'));
  assert.ok(html.includes("html,body{scrollbar-width:none!important}"));
  assert.ok(
    html.includes("html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important}"),
  );
  assert.ok(!html.includes("overflow-y:hidden!important"));
  assert.ok(!html.includes("__INLINE_VISUALIZATION_FRAGMENT__"));
  assert.deepEqual(readAssetCalls.map((path) => basename(path)).sort(), [
    "visualize.css",
    "visualize.html",
  ]);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("protocol:片段引用日历时同步先注册", async () => {
  const { request, readAssetCalls } = fixture(
    "gen-ui",
    fragment.replace("author()", "author('VIZ-CALENDAR')"),
  );
  const html = await (await request()).text();
  assert.ok(html.indexOf("calendar()") < html.indexOf("author("));
  assert.ok(readAssetCalls.map((path) => basename(path)).includes("calendar.js"));
});

test("protocol:MCP App 不注入 Gen UI 资源", async () => {
  const { request, readAssetCalls } = fixture("mcp-app");
  const html = await (await request()).text();
  assert.ok(html.includes("/__zcode__/alias.js"));
  assert.ok(!html.includes("innerKit()"));
  assert.ok(!html.includes("zcode-gen-ui-document-scrollbar"));
  assert.equal(readAssetCalls.length, 0);
});

test("protocol:打包 runtime 缺失时显式失败", async () => {
  const { request } = fixture("gen-ui", fragment, true);
  const response = await request();
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
