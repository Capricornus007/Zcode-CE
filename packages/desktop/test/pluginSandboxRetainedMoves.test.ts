/**
 * 沙箱 retained moves(webview 移动保留)(F5,移植上游 v3.15.1 vitest 用例)。
 * 运行:cd packages/desktop && node --import tsx --test test/pluginSandboxRetainedMoves.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { enableSandboxRetainedMoves } from "../src/preload/pluginSandbox/retainedMoves.js";

test("retainedMoves:仅保留登记的 webview,并在替换后恢复 customElements.define", () => {
  const originalCustomElements = globalThis.customElements;
  const originalElement = globalThis.Element;
  try {
    let connected = 0;
    let disconnected = 0;
    class ElementStub {
      moveBefore() {}
    }
    class Webview extends ElementStub {
      retained = true;
      hasAttribute() {
        return this.retained;
      }
      connectedCallback() {
        connected += 1;
      }
      disconnectedCallback() {
        disconnected += 1;
      }
    }
    const defineCalls = [];
    globalThis.Element = ElementStub;
    globalThis.customElements = { define: (name, ctor) => defineCalls.push({ name, ctor }) };
    assert.equal(enableSandboxRetainedMoves(), true);
    (globalThis.customElements as never).define(
      "webview",
      Webview as unknown as CustomElementConstructor,
    );
    // replaced customElements.define 应捕获到 wrapped 定义(原 define 被调用一次)。
    assert.equal(defineCalls.length, 1);

    const page = new Webview();
    const move = (Webview.prototype as unknown as { connectedMoveCallback(): void })
      .connectedMoveCallback;
    move.call(page);
    assert.equal(disconnected, 0, "retained webview 移动不应触发 disconnected");
    page.retained = false;
    move.call(page);
    assert.equal(disconnected, 1);
    assert.equal(connected, 1);
    page.disconnectedCallback();
    assert.equal(disconnected, 2);
  } finally {
    globalThis.customElements = originalCustomElements;
    globalThis.Element = originalElement;
  }
});
