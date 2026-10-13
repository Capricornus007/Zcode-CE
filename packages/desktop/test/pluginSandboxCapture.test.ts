/**
 * 插件 UI 沙箱截图请求校验与原生缩放裁剪(F5,移植上游 v3.15.1 vitest 用例)。
 * 运行:cd packages/desktop && node --import tsx --test test/pluginSandboxCapture.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { sandboxCaptureSchema, scaleCaptureRect } from "../src/main/pluginSandbox/capture.js";

const request = {
  sandboxId: "page",
  initId: 1,
  viewportSize: { width: 400, height: 300 },
  captureRect: { x: 5, y: 5, width: 390, height: 290 },
};

test("capture:拒绝非有限/超尺寸/出视口的矩形", () => {
  assert.equal(sandboxCaptureSchema.safeParse(request).success, true);
  for (const width of [Infinity, NaN, 0, -1, 401]) {
    assert.equal(
      sandboxCaptureSchema.safeParse({
        ...request,
        captureRect: { ...request.captureRect, width },
      }).success,
      false,
    );
  }
  assert.equal(sandboxCaptureSchema.safeParse({ ...request, initId: -1 }).success, false);
});

test("capture:按原生缩放裁剪,排除绘制边距", () => {
  assert.deepEqual(scaleCaptureRect(request, { width: 800, height: 600 }), {
    x: 10,
    y: 10,
    width: 780,
    height: 580,
  });
  assert.throws(() => scaleCaptureRect(request, { width: 0, height: 0 }));
});
