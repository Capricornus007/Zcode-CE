/**
 * 更新下载失败/完成后复查(X3,移植上游 v3.15.1)。
 *
 * 钉住的契约:
 * 1. update-downloaded(无强更监听)后自动复查一次(download-finished),让 feed 已推进到
 *    更高版本时能替换目标,而不是停在已下载版本;
 * 2. 有可见目标时手动检查不把菜单闪成 checking,检查失败(check failed)不清掉已展示目标;
 * 3. update-not-available 在有可见目标时保留目标(keep)。
 *
 * 运行:cd packages/desktop && node --import tsx --test test/autoUpdaterDownloadRecheck.test.ts
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { register } from "node:module";
import test from "node:test";

register(new URL("./support/stubResolver.mjs", import.meta.url));

const logDir = await mkdtemp(join(tmpdir(), "zcode-x3-"));
process.env.ZCODE_ENV = "test";
process.env.ZCODE_E2E_RUNTIME_LOG_DIR = logDir;

const { initAutoUpdater, checkForUpdateMenuClick, onAutoUpdaterStateChanged } =
  await import("../src/main/autoUpdater.js");
const { stubApp, stubBrowserWindow } = await import("./support/electronStub.mjs");
const { stubAutoUpdater } = await import("./support/electronUpdaterStub.mjs");

test.after(async () => {
  await rm(logDir, { recursive: true, force: true });
});

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createFakeWindow() {
  const sent: { channel: string; payload: unknown }[] = [];
  const window = {
    isDestroyed: () => false,
    isFocused: () => true,
    webContents: {
      id: 7,
      send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
    },
  };
  return { window, sent };
}

async function withPlatform(platform: string, body: () => Promise<void> | void): Promise<void> {
  const previous = process.platform;
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
    writable: true,
  });
  try {
    await body();
  } finally {
    Object.defineProperty(process, "platform", {
      value: previous,
      configurable: true,
      writable: true,
    });
  }
}

test("update-downloaded 后自动复查一次(download-finished)", async () => {
  stubApp.isPackaged = true;
  const states: string[] = [];
  const dispose = onAutoUpdaterStateChanged((state) => states.push(state.kind));
  await withPlatform("linux", async () => {
    await initAutoUpdater({});
    await tick();
    assert.equal(stubAutoUpdater.checkForUpdatesCalls, 1, "保留启动检查");

    stubAutoUpdater.emit("checking-for-update");
    stubAutoUpdater.emit("update-available", { version: "4.0.0" });
    await tick();
    assert.deepEqual(states, ["checking", "update-available"], "状态经事件推进到 update-available");

    stubAutoUpdater.emit("update-downloaded", { version: "4.0.0" });
    await tick();
    assert.equal(
      stubAutoUpdater.checkForUpdatesCalls,
      2,
      "下载完成后必须自动复查一次(发现可能存在的更高版本)",
    );
    assert.equal(states[states.length - 1], "update-downloaded", "下载完成落在 update-downloaded");
  });
  dispose();
});

test("有可见目标时手动检查不闪 checking,检查失败不清掉目标", async () => {
  stubApp.isPackaged = true;
  const states: string[] = [];
  const dispose = onAutoUpdaterStateChanged((state) => states.push(state.kind));
  const originalCheck = stubAutoUpdater.checkForUpdates.bind(stubAutoUpdater);
  await withPlatform("linux", async () => {
    await initAutoUpdater({});
    await tick();
    // 用高于上一用例残留 ready 的版本,使状态真正推进到 update-available
    // (ready 存在且远端不更高时会 keep 在 update-downloaded)。
    stubAutoUpdater.emit("update-available", { version: "5.0.0" });
    await tick();
    states.length = 0;

    // 让后续 checkForUpdates 失败(模拟 check failed 来源)。
    stubAutoUpdater.checkForUpdates = () => Promise.reject(new Error("boom"));
    const { window, sent } = createFakeWindow();
    // sendManualCheckResult 经 BrowserWindow.getAllWindows() 找回窗口;桩默认返回空列表。
    const originalGetAllWindows = stubBrowserWindow.getAllWindows.bind(stubBrowserWindow);
    stubBrowserWindow.getAllWindows = () => [window];
    checkForUpdateMenuClick(window);
    await tick();
    stubBrowserWindow.getAllWindows = originalGetAllWindows;
    assert.deepEqual(states, [], "已有可见目标时不得先把菜单置成 checking(检查结果回来再替换)");
    assert.deepEqual(
      sent.map((item) => item.payload),
      [{ kind: "error", message: "boom" }],
      "检查失败必须回传 error",
    );
    stubAutoUpdater.emit("update-not-available", { version: "5.0.0" });
    await tick();
    assert.ok(states.at(-1) !== "idle", "有可见目标时 update-not-available 不得清回 idle");
  });
  stubAutoUpdater.checkForUpdates = originalCheck;
  dispose();
});
