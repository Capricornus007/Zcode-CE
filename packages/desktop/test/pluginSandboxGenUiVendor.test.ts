/**
 * 打包 Gen UI 脚本重定向与清单校验(F5,移植上游 v3.15.1 vitest 用例)。
 * 运行:cd packages/desktop && node --import tsx --test test/pluginSandboxGenUiVendor.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  createGenUiVendorResources,
  resolveGenUiVendorRedirect,
} from "../src/main/pluginSandbox/genUiVendor.js";
import { createPluginSandboxRegistry } from "../src/main/pluginSandbox/registry.js";

const url = "https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js";
const manifest = { resources: [{ url, file: "d3-7.9.0.min.js" }] };
const registry = createPluginSandboxRegistry();
const input = {
  instance: { runtimeId: "a", generation: 1, token: "one", appIdentity: "a".repeat(64) },
  ownerWebContentsId: 1,
  workspacePath: "/repo",
  sessionId: "s",
  scopeId: "view",
  html: "",
};
const genUi = registry.register({ ...input, contentKind: "gen-ui" });
const mcp = registry.register({ ...input, pluginId: "p", serverName: "s" });

function createRecordingReadAsset(countRef) {
  return async (_path) => {
    countRef.value += 1;
    return new TextEncoder().encode(JSON.stringify(manifest));
  };
}

test("vendor:仅映射活跃 Gen UI 的精确固定 URL,清单只读一次", async () => {
  const countRef = { value: 0 };
  const resources = createGenUiVendorResources("/assets", createRecordingReadAsset(countRef));
  assert.equal(
    await resolveGenUiVendorRedirect(url, registry.get(genUi.sandboxId), resources),
    `zcode-sandbox://plugin-${input.instance.appIdentity}/instance/${genUi.sandboxId}/__zcode__/vendor/d3-7.9.0.min.js`,
  );
  for (const candidate of [
    url + "?v=1",
    url + ".map",
    url.replace("7.9.0", "7.8.0"),
    url.replace("https:", "http:"),
  ]) {
    assert.equal(
      await resolveGenUiVendorRedirect(candidate, registry.get(genUi.sandboxId), resources),
      undefined,
    );
  }
  assert.equal(await resources.hasFile("d3-7.9.0.min.js"), true);
  assert.equal(await resources.hasFile("../d3-7.9.0.min.js"), false);
  assert.equal(countRef.value, 1, "清单只应读一次");
  assert.equal(
    await resolveGenUiVendorRedirect(url, registry.get(mcp.sandboxId), resources),
    undefined,
  );
  assert.equal(await resolveGenUiVendorRedirect(url, null, resources), undefined);
});

test("vendor:缺失/畸形/歧义清单必须显式失败,不回退 CDN", async () => {
  const missing = createGenUiVendorResources("/assets", async () => {
    throw new Error("missing");
  });
  await assert.rejects(() => missing.fileForUrl(url), /missing/);
  for (const resources of [
    [{ url, file: "../escape.js" }],
    [...manifest.resources, ...manifest.resources],
  ]) {
    const invalid = createGenUiVendorResources("/assets", async () =>
      new TextEncoder().encode(JSON.stringify({ resources })),
    );
    await assert.rejects(() => invalid.fileForUrl(url));
  }
});
