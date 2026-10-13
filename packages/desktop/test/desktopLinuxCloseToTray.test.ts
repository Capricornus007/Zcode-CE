/**
 * Linux 关闭驻留托盘(F10,移植上游 v3.15.1)main 侧单测。
 *
 * desktopTraySupport 只依赖 node:child_process(注入式 executor),无需 electron 桩;
 * 关窗分支的同步裁决与托盘创建的合并结果同样以矩阵覆盖。
 *
 * 运行:cd packages/desktop && node --import tsx --test test/desktopLinuxCloseToTray.test.ts
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import {
  createCloseToTrayCapabilityMonitor,
  detectDesktopCloseToTrayCapability,
  isGnomeLikeDesktop,
  parseStatusNotifierOwnerOutput,
  resolveCloseToTrayBootstrapValue,
  resolveCloseToTrayRuntimeValue,
  resolveCloseToTraySupported,
} from "../src/main/desktopTraySupport.js";

// desktopWindowLifecycle 的依赖链静态导入 electron(运行时),桩经解析钩子注入
// (ESM 先 link 后 evaluate,所以这处只能动态 import)。
register(new URL("./support/stubResolver.mjs", import.meta.url));
const { handleDesktopWindowCloseRequest } = await import("../src/main/desktopWindowLifecycle.js");

function createRecordingExecutor(prints: string[]) {
  const calls: { command: string; args: string[] }[] = [];
  return {
    calls,
    execute: (command: string, args: string[]) => {
      calls.push({ command, args });
      return Promise.resolve({ stdout: prints.shift() ?? "" });
    },
  };
}

test("parseStatusNotifierOwnerOutput:gdbus/busctl/qdbus 三族输出都可解析", () => {
  assert.equal(parseStatusNotifierOwnerOutput("(true,)"), true);
  assert.equal(parseStatusNotifierOwnerOutput("(false,)"), false);
  assert.equal(parseStatusNotifierOwnerOutput('b "true"'), true);
  assert.equal(parseStatusNotifierOwnerOutput("b false"), false);
  assert.equal(parseStatusNotifierOwnerOutput("true"), true);
  assert.equal(parseStatusNotifierOwnerOutput("false"), false);
  assert.equal(parseStatusNotifierOwnerOutput("garbage"), null);
  assert.equal(parseStatusNotifierOwnerOutput(""), null);
});

test("isGnomeLikeDesktop:XDG_CURRENT_DESKTOP 大小写与分隔符兼容", () => {
  assert.equal(isGnomeLikeDesktop({ XDG_CURRENT_DESKTOP: "GNOME" }), true);
  assert.equal(isGnomeLikeDesktop({ XDG_CURRENT_DESKTOP: "ubuntu:GNOME" }), true);
  assert.equal(isGnomeLikeDesktop({ XDG_CURRENT_DESKTOP: "KDE" }), false);
  assert.equal(isGnomeLikeDesktop({ XDG_SESSION_DESKTOP: "gnome" }), true);
  assert.equal(isGnomeLikeDesktop({}), false);
});

test("detect:非 Linux 平台固定可用,不发起探测", async () => {
  const rec = createRecordingExecutor(["(false,)"]);
  for (const platform of ["win32", "darwin"] as const) {
    const capability = await detectDesktopCloseToTrayCapability({
      platform,
      env: {},
      execute: rec.execute,
    });
    assert.deepEqual(capability, { supported: true, gnomeLikeWithoutTray: false });
  }
  assert.equal(rec.calls.length, 0, "非 Linux 不应执行任何探测命令");
});

test("detect:首个工具给出明确结果即返回,后续工具不执行", async () => {
  const rec = createRecordingExecutor(["(true,)"]);
  const capability = await detectDesktopCloseToTrayCapability({
    platform: "linux",
    env: {},
    execute: rec.execute,
  });
  assert.equal(capability.supported, true);
  assert.equal(capability.gnomeLikeWithoutTray, false);
  assert.equal(rec.calls.length, 1);
  assert.equal(rec.calls[0]!.command, "gdbus");
});

test("detect:第一个工具输出不可识别时回退到下一个工具", async () => {
  const rec = createRecordingExecutor(["garbage", 'b "false"']);
  const capability = await detectDesktopCloseToTrayCapability({
    platform: "linux",
    env: {},
    execute: rec.execute,
  });
  assert.equal(capability.supported, false);
  assert.equal(rec.calls.map((call) => call.command).join(","), "gdbus,busctl");
});

test("detect:全部工具失败按不可用安全默认 + GNOME 印记", async () => {
  const failingExecutor = () => Promise.reject(new Error("ENOENT"));
  const capability = await detectDesktopCloseToTrayCapability({
    platform: "linux",
    env: { XDG_CURRENT_DESKTOP: "GNOME" },
    execute: failingExecutor,
  });
  assert.equal(capability.supported, false, "失败必须安全默认为不可用(防失联)");
  assert.equal(capability.gnomeLikeWithoutTray, true);
});

test("detect:GNOME 系有 watcher 时不标记扩展提示", async () => {
  const capability = await detectDesktopCloseToTrayCapability({
    platform: "linux",
    env: { XDG_CURRENT_DESKTOP: "ubuntu:GNOME" },
    execute: () => Promise.resolve({ stdout: "(true,)" }),
  });
  assert.deepEqual(capability, { supported: true, gnomeLikeWithoutTray: false });
});

test("monitor:首次 getSync 为 null,refresh 后写缓存,窗口期内不重探", async () => {
  let clock = 1_000;
  const rec = createRecordingExecutor(["(true,)", "(true,)"]);
  const monitor = createCloseToTrayCapabilityMonitor({
    platform: "linux",
    env: {},
    execute: rec.execute,
    staleMs: 10_000,
    now: () => clock,
  });
  assert.equal(monitor.getSync(), null, "首次探测完成前必须按不可用处理");
  const first = await monitor.refresh();
  assert.equal(first.supported, true);
  assert.equal(monitor.getSync()?.supported, true);

  // 缓存窗口内:复用结果,不再执行命令。
  clock += 5_000;
  await monitor.refresh();
  assert.equal(rec.calls.length, 1);

  // 过期后强制重探。
  clock += 10_000;
  await monitor.refresh();
  assert.equal(rec.calls.length, 2);
});

test("monitor:并发 refresh 只发一次探测(inflight 去重)", async () => {
  const rec = createRecordingExecutor(["(false,)"]);
  const monitor = createCloseToTrayCapabilityMonitor({
    platform: "linux",
    env: {},
    execute: rec.execute,
  });
  const results = await Promise.all([monitor.refresh(), monitor.refresh(), monitor.refresh()]);
  assert.equal(rec.calls.length, 1);
  assert.equal(
    results.every((entry) => entry.supported === false),
    true,
  );
});

test("resolveCloseToTraySupported:win32 只看托盘实例,linux 需双条件", () => {
  assert.equal(
    resolveCloseToTraySupported({
      platform: "win32",
      desktopTrayReady: true,
      capabilitySupported: undefined,
    }),
    true,
  );
  assert.equal(
    resolveCloseToTraySupported({
      platform: "win32",
      desktopTrayReady: false,
      capabilitySupported: true,
    }),
    false,
  );
  assert.equal(
    resolveCloseToTraySupported({
      platform: "linux",
      desktopTrayReady: true,
      capabilitySupported: true,
    }),
    true,
  );
  assert.equal(
    resolveCloseToTraySupported({
      platform: "linux",
      desktopTrayReady: true,
      capabilitySupported: false,
    }),
    false,
  );
  assert.equal(
    resolveCloseToTraySupported({
      platform: "linux",
      desktopTrayReady: false,
      capabilitySupported: true,
    }),
    false,
  );
  assert.equal(
    resolveCloseToTraySupported({
      platform: "linux",
      desktopTrayReady: true,
      capabilitySupported: undefined,
    }),
    false,
    "空缓存按不可用(防 GNOME 静默失败失联)",
  );
  assert.equal(
    resolveCloseToTraySupported({
      platform: "darwin",
      desktopTrayReady: true,
      capabilitySupported: true,
    }),
    false,
  );
});

test("resolveCloseToTrayBootstrapValue:矩阵", () => {
  // 非 Linux:存储值或默认 true,不做迁移。
  assert.deepEqual(
    resolveCloseToTrayBootstrapValue({
      platform: "win32",
      stored: undefined,
      linuxMigrationInitialized: undefined,
    }),
    { value: true, needsLinuxMigration: false },
  );
  assert.deepEqual(
    resolveCloseToTrayBootstrapValue({
      platform: "darwin",
      stored: false,
      linuxMigrationInitialized: undefined,
    }),
    { value: false, needsLinuxMigration: false },
  );

  // Linux:未迁移 -> 强制归位默认关 + 触发一次性迁移。
  assert.deepEqual(
    resolveCloseToTrayBootstrapValue({
      platform: "linux",
      stored: true,
      linuxMigrationInitialized: undefined,
    }),
    { value: false, needsLinuxMigration: true },
  );
  assert.deepEqual(
    resolveCloseToTrayBootstrapValue({
      platform: "linux",
      stored: true,
      linuxMigrationInitialized: false,
    }),
    { value: false, needsLinuxMigration: true },
  );

  // Linux:已迁移 -> 尊重存储值,默认关(与 shared 的 Linux 语义一致)。
  assert.deepEqual(
    resolveCloseToTrayBootstrapValue({
      platform: "linux",
      stored: true,
      linuxMigrationInitialized: true,
    }),
    { value: true, needsLinuxMigration: false },
  );
  assert.deepEqual(
    resolveCloseToTrayBootstrapValue({
      platform: "linux",
      stored: undefined,
      linuxMigrationInitialized: true,
    }),
    { value: false, needsLinuxMigration: false },
  );
});

test("resolveCloseToTrayRuntimeValue:迁移持久化失败回退文件值(单数据源)", () => {
  // 迁移需要但持久化失败:回退到存储值,维持"文件是唯一可信来源"(CR-02)。
  assert.equal(
    resolveCloseToTrayRuntimeValue({
      platform: "linux",
      stored: true,
      linuxMigrationInitialized: undefined,
      migrationPersisted: false,
    }),
    true,
  );
  // 迁移成功或无需迁移:走 bootstrap 值。
  assert.equal(
    resolveCloseToTrayRuntimeValue({
      platform: "linux",
      stored: true,
      linuxMigrationInitialized: undefined,
      migrationPersisted: true,
    }),
    false,
  );
  assert.equal(
    resolveCloseToTrayRuntimeValue({
      platform: "win32",
      stored: undefined,
      linuxMigrationInitialized: undefined,
      migrationPersisted: true,
    }),
    true,
  );
});

function createCloseOptions(overrides: Record<string, unknown> = {}) {
  return {
    platform: "linux" as NodeJS.Platform,
    forceQuit: false,
    closeToTray: true,
    closeToTraySupported: true,
    isLastWindow: true,
    label: "main",
    logger: { info: () => undefined },
    confirmQuit: () => true,
    requestQuit: () => undefined,
    hideWindow: () => undefined,
    ...overrides,
  };
}

test("lifecycle:linux 有能力+开关开 -> 隐藏到托盘", () => {
  let hidden = false;
  const result = handleDesktopWindowCloseRequest(
    createCloseOptions({ hideWindow: () => (hidden = true) }),
  );
  assert.equal(result, true);
  assert.equal(hidden, true);
});

// 未隐藏时 handler 拦截 close 并走确认退出流程,返回 true 表示"已接管"(不是隐藏)。
test("lifecycle:能力未确认 -> 不隐藏(避免失联),走确认退出", () => {
  for (const closeToTraySupported of [undefined, false]) {
    let hidden = false;
    let quitRequested = false;
    const result = handleDesktopWindowCloseRequest(
      createCloseOptions({
        closeToTraySupported,
        hideWindow: () => (hidden = true),
        requestQuit: () => (quitRequested = true),
      }),
    );
    assert.equal(hidden, false, "能力未确认不允许隐藏");
    assert.equal(quitRequested, true, "走确认退出路径");
    assert.equal(result, true, "close 被拦截接管,而非直接放行");
  }
});

test("lifecycle:win32 仍可隐藏(平台分支未回归)", () => {
  let hidden = false;
  const result = handleDesktopWindowCloseRequest(
    createCloseOptions({
      platform: "win32",
      closeToTraySupported: true,
      hideWindow: () => (hidden = true),
    }),
  );
  assert.equal(result, true);
  assert.equal(hidden, true);
});

// 隐藏分支本身不校验 isLastWindow(关窗即驻留,与窗口数无关);这些路径的语义是
// "不隐藏":forceQuit 放行 close(false),explicitQuit / 非末窗口走退出拦截(true)。
test("lifecycle:forceQuit 放行 close;explicitQuit / 非末窗口走退出路径不隐藏", () => {
  let hidden = 0;
  assert.equal(handleDesktopWindowCloseRequest(createCloseOptions({ forceQuit: true })), false);
  assert.equal(
    handleDesktopWindowCloseRequest(
      createCloseOptions({ explicitQuitRequested: true, hideWindow: () => (hidden += 1) }),
    ),
    true,
    "explicitQuit 走退出拦截",
  );
  // 隐藏分支不校验窗口数:关窗即驻留托盘(与 Windows 行为一致),非末窗口同样隐藏。
  assert.equal(
    handleDesktopWindowCloseRequest(
      createCloseOptions({ isLastWindow: false, hideWindow: () => (hidden += 1) }),
    ),
    true,
    "非末窗口同样驻留托盘(托盘分支不按窗口数判断)",
  );
  assert.equal(hidden, 1, "非末窗口 close 被隐藏到托盘");
});
