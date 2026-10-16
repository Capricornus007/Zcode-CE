import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createOnboardingRecordService } from "../src/onboarding/onboardingRecordService.js";
import { setDataBaseDir } from "../src/paths.js";

/**
 * appendRecord 新建文件的 deviceMid 口径（C48）。
 *
 * 背景（判别实验，非源码推理）：web 客户端的 platform.getDeviceId() 返回浏览器物理指纹
 * （"MacIntel|1920|1080|30" 形态，非 UUID）。修复前 appendRecord 在记录文件不存在时
 * 直接落调用方传入的值 ⇒ 全新部署下首条引导记录把指纹固化为文件 deviceMid，
 * 与 telemetry-state.json 的设备身份（X-Device-Mid / claim / 反馈同源）分叉。
 * 修复后新建文件的 deviceMid 一律由服务侧 resolveDeviceMid 解析，调用方传入值
 * 退化为纯诊断（mismatch warn）。
 *
 * 运行：cd packages/services && node --import tsx --test test/onboardingAppendRecordDeviceMid.test.ts
 */

const USER = "u-web";
const HOST_DEVICE_MID = "HOST-DEVICE-UUID-AAAA-BBBB";
const WEB_FINGERPRINT = "MacIntel|1920|1080|30";

async function withDataDir(run: (recordPath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "zcode-onboarding-append-"));
  setDataBaseDir(dir);
  try {
    const recordPath = join(dir, ".zcode", "v2", "onboarding-record.json");
    await run(recordPath);
  } finally {
    setDataBaseDir(null);
    await rm(dir, { recursive: true, force: true });
  }
}

function entry() {
  return {
    occupation: "developer",
    interfaceMode: "coding" as const,
    memoryEnabled: null,
    proactiveSuggestionsEnabled: null,
    completedAt: new Date("2026-10-04T00:00:00Z").toISOString(),
  };
}

test("核心：文件不存在时，appendRecord 落的是调用方传入的设备身份（官方契约：设备身份由调用侧解析后传入）", async () => {
  await withDataDir(async (recordPath) => {
    const service = createOnboardingRecordService({
      loadUserId: async () => USER,
    });
    await service.appendRecord(HOST_DEVICE_MID, entry());
    const raw = JSON.parse(await readFile(recordPath, "utf8")) as { deviceMid?: string };
    assert.equal(
      raw.deviceMid,
      HOST_DEVICE_MID,
      "新建文件的 deviceMid = appendRecord 入参（UI 侧 platform.getDeviceId 解析后传入，官方同款）",
    );
  });
});

test("已有文件：以文件内 deviceMid 为权威，appendRecord 不得改写（含 mismatch 时沿用旧值）", async () => {
  await withDataDir(async (recordPath) => {
    await mkdir(dirname(recordPath), { recursive: true });
    await writeFile(
      recordPath,
      JSON.stringify(
        { version: 2, deviceMid: HOST_DEVICE_MID, entries: [], decisions: [] },
        null,
        2,
      ),
    );
    const service = createOnboardingRecordService({
      loadUserId: async () => USER,
      resolveDeviceMid: async () => "SHOULD-NOT-BE-USED",
    });
    await service.appendRecord(WEB_FINGERPRINT, entry());
    const raw = JSON.parse(await readFile(recordPath, "utf8")) as { deviceMid?: string };
    assert.equal(raw.deviceMid, HOST_DEVICE_MID, "已有文件的 deviceMid 不得被 appendRecord 改写");
  });
});

test("边界：appendRecord 的设备身份入参原样落盘（官方契约：无宿主侧二次解析）", async () => {
  await withDataDir(async (recordPath) => {
    const service = createOnboardingRecordService({
      loadUserId: async () => USER,
    });
    await service.appendRecord(HOST_DEVICE_MID, entry());
    const raw = JSON.parse(await readFile(recordPath, "utf8")) as { deviceMid?: string };
    assert.equal(raw.deviceMid, HOST_DEVICE_MID);
  });
});
