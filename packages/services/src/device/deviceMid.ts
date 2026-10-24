import { createUuid } from "@zcode/shared";
import { mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAppConfigDir } from "../paths.js";

const LOCK_RETRY_DELAY_MS = 10;
const LOCK_RETRY_COUNT = 200;
const LOCK_STALE_MS = 5 * 60 * 1000;

interface DeviceState {
  deviceMid?: string;
  [key: string]: unknown;
}

interface DeviceLockOwner {
  pid: number;
  createdAt: number;
}

const deviceMidCacheByStateFile = new Map<string, Promise<string>>();

// 文件名为兼容既有安装保留：deviceMid 是计费头 X-Device-Mid 的身份来源，
// 必须与同机 CLI / Desktop 读同一份状态，改名会让已发放的权益头失效。
function resolveDeviceStateFile(homeDir?: string): string {
  if (homeDir) {
    return join(homeDir, ".zcode", "v2", "telemetry-state.json");
  }
  return join(getAppConfigDir(), "telemetry-state.json");
}

function resolveDeviceLockFile(homeDir?: string): string {
  if (homeDir) {
    return join(homeDir, ".zcode", "v2", "telemetry-state.lock");
  }
  return join(getAppConfigDir(), "telemetry-state.lock");
}

async function readDeviceState(homeDir?: string): Promise<DeviceState> {
  try {
    const raw = await readFile(resolveDeviceStateFile(homeDir), "utf-8");
    const parsed = JSON.parse(raw) as DeviceState;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

async function writeDeviceState(state: DeviceState, homeDir?: string): Promise<void> {
  const stateFile = resolveDeviceStateFile(homeDir);
  await mkdir(dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify(state, null, 2), "utf-8");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readLockOwner(lockFile: string): Promise<DeviceLockOwner | null> {
  try {
    const raw = await readFile(lockFile, "utf-8");
    const parsed = JSON.parse(raw) as Partial<DeviceLockOwner>;
    if (
      typeof parsed.pid === "number" &&
      Number.isInteger(parsed.pid) &&
      parsed.pid > 0 &&
      typeof parsed.createdAt === "number" &&
      Number.isFinite(parsed.createdAt)
    ) {
      return { pid: parsed.pid, createdAt: parsed.createdAt };
    }
  } catch {
    return null;
  }
  return null;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (
      error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code !== "ESRCH"
    );
  }
}

async function removeStaleLockIfNeeded(lockFile: string, timestamp: number): Promise<boolean> {
  try {
    const metadata = await stat(lockFile);
    if (timestamp - metadata.mtimeMs < LOCK_STALE_MS) {
      const owner = await readLockOwner(lockFile);
      if (!owner || isProcessAlive(owner.pid)) {
        return false;
      }
    }
    await unlink(lockFile).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function withDeviceStateLock<T>(
  homeDir: string | undefined,
  run: (state: DeviceState) => Promise<T>,
): Promise<T> {
  const lockFile = resolveDeviceLockFile(homeDir);
  await mkdir(dirname(lockFile), { recursive: true });

  for (let attempt = 0; attempt < LOCK_RETRY_COUNT; attempt += 1) {
    try {
      const handle = await open(lockFile, "wx");
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now() }), "utf-8");
        const state = await readDeviceState(homeDir);
        return await run(state);
      } finally {
        await handle.close();
        await unlink(lockFile).catch(() => {});
      }
    } catch (error) {
      const isLockConflict =
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "EEXIST";
      if (!isLockConflict) {
        throw error;
      }
      const removedStaleLock = await removeStaleLockIfNeeded(lockFile, Date.now());
      if (removedStaleLock) {
        continue;
      }
      await sleep(LOCK_RETRY_DELAY_MS);
    }
  }

  throw new Error("Device state lock timeout");
}

export interface EnsureDeviceMidOptions {
  homeDir?: string;
  randomUUID?: () => string;
}

function rememberDeviceMid(stateFile: string, deviceMid: string): string {
  deviceMidCacheByStateFile.set(stateFile, Promise.resolve(deviceMid));
  return deviceMid;
}

/**
 * 确保设备身份文件里存在 deviceMid 并返回它。
 *
 * 这不是遥测上报：X-Device-Mid 是计费 / 领取接口的硬门槛，且必须与同机 CLI /
 * Desktop 同值。CE 剥离遥测模块（P1）后，设备身份的读写职责由本文件独立承担。
 */
export function ensureDeviceMid(options: EnsureDeviceMidOptions = {}): Promise<string> {
  const stateFile = resolveDeviceStateFile(options.homeDir);
  const cached = deviceMidCacheByStateFile.get(stateFile);
  if (cached) {
    return cached;
  }

  const pending = withDeviceStateLock(options.homeDir, async (state) => {
    if (state.deviceMid) {
      return rememberDeviceMid(stateFile, state.deviceMid);
    }
    const deviceMid = (options.randomUUID ?? createUuid)();
    state.deviceMid = deviceMid;
    await writeDeviceState(state, options.homeDir);
    return rememberDeviceMid(stateFile, deviceMid);
  }).catch((error) => {
    if (deviceMidCacheByStateFile.get(stateFile) === pending) {
      deviceMidCacheByStateFile.delete(stateFile);
    }
    throw error;
  });
  deviceMidCacheByStateFile.set(stateFile, pending);
  return pending;
}
