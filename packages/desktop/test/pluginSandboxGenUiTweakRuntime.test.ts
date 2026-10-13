/**
 * Gen UI tweak runtime(序列化 ACK、预览应用、原值回滚)(F5,移植上游 v3.15.1 vitest 用例)。
 * 运行:cd packages/desktop && node --import tsx --test test/pluginSandboxGenUiTweakRuntime.test.ts
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

async function setup(send) {
  const document = {};
  const listeners = new Map();
  class Element {
    ownerDocument = document;
    isConnected = true;
    id = "component";
    localName = "div";
    parentElement = null;
    getAttribute() {
      return "Component";
    }
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 100, height: 80 };
    }
  }
  const context = {
    document,
    Element,
    CSS: { escape: (s) => s },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    reportError: (error) => {
      throw error;
    },
    send,
  };
  const source = await readFile(
    new URL("../src/renderer/src/plugin-sandbox/genUiTweakRuntime.js", import.meta.url),
    "utf8",
  );
  runInNewContext(
    source.replace("export function", "function") + "\ninstallGenUiTweakRuntime(send);",
    context,
  );
  return {
    Tweak: context.Tweak,
    container: new Element(),
    globals: (value) =>
      listeners.get("zcode:set_globals")?.({
        detail: { globals: { visualizationAnnotation: value } },
      }),
  };
}

test("tweak runtime:序列化注册 ACK、应用预览并恢复原值", async () => {
  const calls = [];
  const gate = Promise.withResolvers();
  const second = Promise.withResolvers();
  const runtime = await setup(async (_name, message) => {
    calls.push(message);
    if (calls.length === 1) await gate.promise;
    if (calls.length === 2) second.resolve();
    return { annotationControls: message.annotationControls };
  });
  const values = { size: 12, enabled: true };
  const seen = [];
  const panel = new runtime.Tweak({
    container: runtime.container,
    onChange: () => seen.push(values.size),
  });
  panel.addSlider(values, "size", { min: 0, max: 40 });
  panel.addToggle(values, "enabled");
  await new Promise(setImmediate);
  assert.equal(calls.length, 1, "注册登记必须先发出 register");
  gate.resolve();
  await second.promise;
  await new Promise(setImmediate);
  assert.equal(calls[1].type, "update");
  assert.equal(calls[1].annotationControls.controls.length, 2);
  const control = calls[0].annotationControls.controls[0];
  const command = (value, previousValue = 12) => ({
    active: false,
    changes: [
      {
        registrationId: "tweak-1",
        targetId: "1",
        annotationControlChanges: [{ callback: control.callback, value, previousValue }],
      },
    ],
  });
  runtime.globals(command(20));
  assert.equal(values.size, 20);
  runtime.globals(command(30, 999));
  assert.equal(values.size, 12, "previousValue 不匹配必须回滚");
  runtime.globals(command(20));
  panel.dispose();
  await new Promise(setImmediate);
  assert.equal(values.size, 12, "dispose 后恢复原值");
  assert.equal(calls.at(-1).type, "dispose");
  assert.deepEqual(seen, [20, 12, 20, 12]);
});

test("tweak runtime:非法绑定前即拒绝,被拒注册回滚", async () => {
  const calls = [];
  const runtime = await setup(async (_name, message) => {
    calls.push(message);
    return {};
  });
  const panel = new runtime.Tweak({ container: runtime.container, onChange() {} });
  assert.throws(() => panel.addSlider({ x: 20 }, "x", { min: 0, max: 10 }));
  assert.equal(calls.length, 0, "本地非法绑定不应发出任何消息");
  panel.addToggle({ enabled: true }, "enabled");
  panel.addToggle({ enabled: false }, "enabled");
  await new Promise(setImmediate);
  assert.deepEqual(
    calls.map((call) => call.type),
    ["register", "dispose"],
  );
  assert.throws(() => panel.addToggle({ enabled: true }, "enabled"));
});
