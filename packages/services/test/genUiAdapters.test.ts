import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getGenUiOutputDirectory } from "@zcode/shared/node";
import { readGenUiDocument } from "../src/gen-ui/adapters/files.js";
import { createGenUiService } from "../src/gen-ui/adapters/service.js";
import { createGenUiStateStorage } from "../src/gen-ui/adapters/stateStorage.js";

/**
 * Gen UI 执行端读片与状态持久化的回归测试（上游 aac47556 的 3 个 vitest 文件改写为
 * node:test；这一层全是安全判据——输出根目录外的路径、符号链接、整文档、超界文件
 * 一旦放行就是执行端 Host 的文件读取越权，所以照上游逐条搬运断言）。
 *
 * 运行：cd packages/services && node --import tsx --test test/genUiAdapters.test.ts
 */

const roots: string[] = [];
async function cleanup() {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}
test.after(cleanup);

async function fixture(workspaceIdentity?: string, workspaceContainsOutput = false) {
  const root = await mkdtemp(join(tmpdir(), "zcode-gen-ui-"));
  roots.push(root);
  const workspacePath = workspaceContainsOutput ? root : join(root, "workspace");
  const outputRoot = join(root, "user-data", "visualizations");
  const scope = { workspacePath, workspaceIdentity, sessionId: "test" };
  const directory = getGenUiOutputDirectory(outputRoot, scope);
  await mkdir(workspacePath, { recursive: true });
  await mkdir(directory, { recursive: true });
  return { root, outputRoot, directory, target: { ...scope, path: join(directory, "chart.html") } };
}

test("读取会话产物不写回工作区，且 fork 与跨身份都能读", async () => {
  const { outputRoot, target } = await fixture(undefined);
  await writeFile(target.path, '<div id="chart">Hello</div>');
  const first = await readGenUiDocument(target, outputRoot);
  assert.ok(first.html.includes("Hello"));
  assert.deepEqual(await readdir(target.workspacePath), []);
  const forked = await readGenUiDocument({ ...target, sessionId: "forked" }, outputRoot);
  assert.ok(forked.html.includes("Hello"));
  const other = await readGenUiDocument(
    { ...target, workspaceIdentity: "ssh:other:/workspace" },
    outputRoot,
  );
  assert.ok(other.html.includes("Hello"));
  const ident = await fixture("ssh:executor:/workspace");
  await writeFile(ident.target.path, '<div id="chart">Hello</div>');
  assert.ok(
    (await readGenUiDocument(ident.target, ident.outputRoot)).html.includes("Hello"),
  );
});

test("工作区包含输出根时仍按固定目录读取", async () => {
  for (const identity of [undefined, "ssh:executor:/home/dev"] as const) {
    const { outputRoot, target } = await fixture(identity, true);
    await writeFile(target.path, "<div>Home workspace</div>");
    assert.equal(
      (await readGenUiDocument(target, outputRoot)).html,
      "<div>Home workspace</div>",
    );
    assert.equal(
      (await readGenUiDocument({ ...target, sessionId: "forked" }, outputRoot)).html,
      "<div>Home workspace</div>",
    );
  }
});

test("拒绝输出根之外的路径与其下的符号链接", async () => {
  const { outputRoot, target, directory } = await fixture();
  const oldPath = join(target.workspacePath, "chart.html");
  await writeFile(oldPath, "outside");
  await assert.rejects(
    () => readGenUiDocument({ ...target, path: oldPath }, outputRoot),
    /host output directory/,
  );
  await symlink(oldPath, target.path);
  await assert.rejects(
    () => readGenUiDocument(target, outputRoot),
    /symbolic links/,
  );
  await rm(directory, { recursive: true });
  await symlink(target.workspacePath, directory, "junction");
  await assert.rejects(
    () => readGenUiDocument(target, outputRoot),
    /symbolic links/,
  );
});

test("Host 根别名真实路径在工作区内也可读", async () => {
  const { root, target } = await fixture();
  const outputRoot = join(root, "redirected");
  await symlink(target.workspacePath, outputRoot, "junction");
  const path = join(
    getGenUiOutputDirectory(outputRoot, {
      workspacePath: target.workspacePath,
      sessionId: target.sessionId,
    }),
    "chart.html",
  );
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "<div>Host root alias</div>");
  assert.equal(
    (await readGenUiDocument({ ...target, path }, outputRoot)).html,
    "<div>Host root alias</div>",
  );
});

test("拒绝根穿越、兄弟前缀与目录", async () => {
  const { outputRoot, directory, target } = await fixture();
  for (const path of [join(outputRoot, "..", "chart.html"), join(`${outputRoot}-other`, "chart.html")]) {
    await assert.rejects(
      () => readGenUiDocument({ ...target, path }, outputRoot),
      /host output directory/,
    );
  }
  const directoryPath = join(directory, "folder.html");
  await mkdir(directoryPath);
  await assert.rejects(
    () => readGenUiDocument({ ...target, path: directoryPath }, outputRoot),
    /regular file/,
  );
});

test("拒绝整文档与超界文件", async () => {
  const { outputRoot, target } = await fixture();
  await writeFile(target.path, "<!doctype html><html><body>not a fragment</body></html>");
  await assert.rejects(() => readGenUiDocument(target, outputRoot), /fragment/);
  await writeFile(target.path, "x".repeat(5_000_001));
  await assert.rejects(() => readGenUiDocument(target, outputRoot), /5 MB/);
});

test("prepareSandbox 带受限溯源与转义的初始状态", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "gen-ui-service-"));
  let input: import("@zcode/shared/mcp-apps").PluginSandboxRegisterInput | undefined;
  const service = createGenUiService({
    stateRoot,
    registerSandbox: async (value) => {
      input = value;
      return {
        instance: value.instance,
        sandboxId: "sandbox",
        initId: 1,
        partition: "gen-ui",
        shellUrl: "zcode-sandbox://fixture",
      };
    },
  });
  const target = {
    workspacePath: "/work",
    workspaceIdentity: "remote:fixture",
    sessionId: "s",
    path: "/work/demo.html",
  };
  try {
    await service.setState({
      target,
      state: { modelContent: null, privateContent: "</script><script>evil()</script>" },
    });
    await service.prepareSandbox({
      ...target,
      html: '<p id="content">Hello</p>',
      ownerWebContentsId: 1,
      instanceKey: "row:0",
    });
    assert.equal(input?.contentKind, "gen-ui");
    assert.equal(input?.pluginId, undefined);
    assert.equal(input?.serverName, undefined);
    assert.deepEqual(input?.csp?.connectDomains ?? [], []);
    assert.deepEqual(input?.csp?.frameDomains ?? [], []);
    assert.equal(input?.html?.includes("<script>evil()"), false);
    const stateIdx = input?.html?.indexOf("zcode-gen-ui-initial-state") ?? -1;
    const runtimeIdx = input?.html?.indexOf("__ZCODE_GEN_UI_RUNTIME__") ?? -1;
    assert.ok(stateIdx > -1 && stateIdx < runtimeIdx);
    await assert.rejects(
      () =>
        service.prepareSandbox({
          ...target,
          html: "<html></html>",
          ownerWebContentsId: 1,
          instanceKey: "row:0",
        }),
      /fragment/,
    );
  } finally {
    service.dispose();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("状态持久化跨实例串行、单 scope 保留最新 100 条", async () => {
  const root = await mkdtemp(join(tmpdir(), "gen-ui-state-"));
  const a = createGenUiStateStorage(root);
  const b = createGenUiStateStorage(root);
  try {
    const scope = { workspacePath: "/workspace", sessionId: "task" };
    for (let i = 0; i < 102; i++) {
      const storage = i % 2 ? a : b;
      await storage.set(
        { ...scope, path: `/workspace/view-${i}.html` },
        { modelContent: i, privateContent: null },
      );
    }
    const entries = await b.list(scope);
    assert.equal(entries.length, 100);
    assert.ok(entries.some((entry) => entry.path === "/workspace/view-101.html"));
    assert.equal(await a.get({ ...scope, path: "/workspace/view-0.html" }), null);
  } finally {
    a.dispose();
    b.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("状态跨实例恢复且并发写串行成完整快照", async () => {
  const root = await mkdtemp(join(tmpdir(), "gen-ui-state-"));
  const first = createGenUiStateStorage(root);
  const second = createGenUiStateStorage(root);
  try {
    const target = {
      workspacePath: "/workspace",
      sessionId: "task",
      path: "/workspace/chart.html",
    };
    for (const tab of [1, 2, 3]) {
      await first.set(target, { modelContent: null, privateContent: { tab } });
    }
    assert.deepEqual(await second.get(target), { modelContent: null, privateContent: { tab: 3 } });
    assert.equal(await second.get({ ...target, workspaceIdentity: "remote-example" }), null);
    await second.set(target, { modelContent: { year: 2026 }, privateContent: null });
    assert.deepEqual(await first.get(target), {
      modelContent: { year: 2026 },
      privateContent: null,
    });
  } finally {
    first.dispose();
    second.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("外部写入广播且不回环", async () => {
  const root = await mkdtemp(join(tmpdir(), "gen-ui-state-"));
  const a = createGenUiStateStorage(root);
  const b = createGenUiStateStorage(root);
  try {
    const target = {
      workspacePath: "/workspace",
      sessionId: "task",
      path: "/workspace/chart.html",
    };
    await a.get(target);
    const changed = new Promise<unknown>((resolve) => {
      const off = a.onChanged((event) => {
        off.dispose();
        resolve(event.state);
      });
    });
    await b.set(target, { modelContent: "selection", privateContent: null });
    assert.deepEqual(await changed, { modelContent: "selection", privateContent: null });
  } finally {
    a.dispose();
    b.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
