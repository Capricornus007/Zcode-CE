import assert from "node:assert/strict";
import test from "node:test";
import { mcpAppInstanceSchema } from "../src/mcp-apps/instance.js";
import {
  MCP_APPS_APP_TOOLS_MAX_PER_INSTANCE,
  MCP_APPS_APP_TOOL_MODEL_NAME_PREFIX,
  buildMcpAppsAppToolModelName,
  mcpAppsAppToolDescriptorSchema,
  normalizeMcpAppsAppTools,
  sanitizeMcpAppsModelNamePart,
} from "../src/mcp-apps/appTools.js";
import { mcpAppsSamplingParamsSchema } from "../src/mcp-apps/sampling.js";
import {
  MCP_APPS_UI_READ_RESOURCE_MAX_BYTES,
  isMcpAppsUiReadResourceMimeAllowed,
} from "../src/mcp-apps/resourceMime.js";

/**
 * F5 MCP Apps shared 契约的回归网（上游 aac47556 搬运后）。
 *
 * 上游把 mcp-ui 契约放在 shared 与 bootstrap 两层但未带 shared 测试； 这里钉住
 * 三端共用的关键界：实例凭证形状、app-provided 工具描述符与界、采样参数、资源 MIME 白名单。
 * 表现出错时是宿主/页面/模型三方对同一工具或实例的读数静默分叉。
 *
 * 运行：cd packages/shared && node --import tsx --test test/mcpAppsContract.test.ts
 */

test("mcpAppInstanceSchema 接受合法凭证并 round-trip", () => {
  const instance = {
    runtimeId: "11111111-1111-1111-1111-111111111111",
    generation: 3,
    token: "22222222-2222-2222-2222-222222222222",
    appIdentity: "a".repeat(64),
  };
  const parsed = mcpAppInstanceSchema.parse(instance);
  assert.deepEqual(parsed, instance);
});

test("mcpAppInstanceSchema 是 strict：多余键被拒", () => {
  assert.throws(() =>
    mcpAppInstanceSchema.parse({
      runtimeId: "r",
      generation: 1,
      token: "t",
      appIdentity: "a",
      extra: true,
    }),
  );
});

test("app tool 描述符带必填形状，界在常量上", () => {
  const tool = {
    name: "doThing",
    title: "Do Thing",
    description: "does the thing",
    inputSchema: { type: "object" as const, properties: {} },
  };
  const parsed = mcpAppsAppToolDescriptorSchema.parse(tool);
  assert.equal(parsed.name, "doThing");
  assert.equal(MCP_APPS_APP_TOOLS_MAX_PER_INSTANCE, 50);
});

test("app tool 模型名前缀 app__ 与消毒函数", () => {
  assert.equal(MCP_APPS_APP_TOOL_MODEL_NAME_PREFIX, "app__");
  const name = buildMcpAppsAppToolModelName("plugin:demo:server", "doThing");
  assert.ok(name.startsWith("app__"));
  assert.ok(name.includes("doThing"));
  // 模型名里不得带平台分隔符等危险字符
  assert.ok(!sanitizeMcpAppsModelNamePart("bad/name").includes("/"));
});

test("normalizeMcpAppsAppTools 丢掉非法描述符而保留合法的", () => {
  const ok = {
    name: "ok",
    title: "OK",
    description: "d",
    inputSchema: { type: "object", properties: {} },
  };
  const res = normalizeMcpAppsAppTools([ok, { bogus: true }]);
  assert.equal(res.tools.length, 1);
  assert.equal(res.tools[0]?.name, "ok");
});

test("sampling 参数是 strict，超长请求被拒", () => {
  assert.throws(() => mcpAppsSamplingParamsSchema.parse({ unknown: 1 }));
});

test("UI 资源读取：8 MiB 上界与 MIME 白名单判据", () => {
  assert.equal(MCP_APPS_UI_READ_RESOURCE_MAX_BYTES, 8 * 1024 * 1024);
  assert.equal(isMcpAppsUiReadResourceMimeAllowed("text/html"), true);
  assert.equal(isMcpAppsUiReadResourceMimeAllowed("application/x-evil"), false);
});
