/**
 * CUA Product Helper → agent spawn env 组装器（CE dev-chain 回植）。
 *
 * 官方 node.ts 对齐时整块回退；本模块以独立文件承载同一实现，供
 * test/cuaProductHelperSpawnEnv.test.ts 的规格钉与内置插件的 spawn 链消费。
 * 依赖的 has/clear/mark 助手在本文件底部以 no-op/false 桩落地（CE 不随包携带
 * product Helper host 层，与 packages/zcode-cua/broker-server.js 的桩逐字同义）。
 */
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import { BROKER_UNAVAILABLE_ENV, isCuaHelperError } from "@zcode/zcode-cua/broker";
import { resolveCuaProductHelperSpawnEnv } from "./cua-permission-broker/cuaProductHelperSpawnEnv.js";
import type { CuaHelperHost } from "./cua-permission-broker/index.js";
import type { CuaHelperTransportHandle } from "./cua-permission-broker/windowsCuaDevHelperHost.js";

/**
 * CE 构建不携带 product Helper host 层：broker-server 的 marker 桩在这里同样以
 * no-op / false 语义落地（与 packages/zcode-cua/broker-server.js 逐字同义）。
 */
export function markCuaProductHelperAgentEnvUnavailable(_host: unknown): void {}
export function hasCuaProductHelperAgentEnvUnavailable(_host: unknown): boolean {
  return false;
}
export function clearCuaProductHelperAgentEnvUnavailable(_host: unknown): void {}

const CUA_PRODUCT_HELPER_AGENT_ENV_RETRY_MS = 30_000;
const CUA_PRODUCT_HELPER_SPAWN_READY_DEADLINE_MS = 1_000;

type DefaultCuaProductHelper = {
  host: ManagedCuaProductHelperHost;
  macPermissionHost?: CuaHelperHost;
  resolver: CuaProductMcpServerResolver;
};

type ManagedDefaultCuaProductHelper = {
  helper: DefaultCuaProductHelper;
  seedContext?: CuaProductMcpServerResolverContext;
};

const cuaProductHelperAgentEnvRetryAt = new WeakMap<Pick<CuaHelperHost, "start">, number>();
const cuaProductHelperTrackedStart = new WeakMap<Pick<CuaHelperHost, "start">, Promise<unknown>>();
/**
 * 本次 startup 期间有 agent 消费过 reservation（拿了 Helper 尚未就绪时预留的 tuple）。
 *
 * 撤销路径不可省：那些 spawn 是**成功返回**的，从未进过 catch，所以 startup 最终失败时
 * 没有任何既有机制会把它们标记为需要重新 spawn。这里补上 mark，让后续 spawn 在 Helper
 * 不可用时继续 fail-closed；Helper ready 后只清理 marker，不回收已有 Agent。
 */
const cuaProductHelperReservedSpawns = new WeakSet<Pick<CuaHelperHost, "start">>();
/** Agent 已消费 Windows transport_ready tuple；full startup 后续失败时仍保留既有 Agent。 */
const cuaProductHelperTransportSpawns = new WeakSet<Pick<CuaHelperHost, "start">>();

function trackCuaProductHelperStartup(
  host: Pick<CuaHelperHost, "start">,
  startup: Promise<unknown>,
): void {
  if (cuaProductHelperTrackedStart.get(host) === startup) return;
  cuaProductHelperTrackedStart.set(host, startup);
  void startup.then(
    () => {
      cuaProductHelperAgentEnvRetryAt.delete(host);
      cuaProductHelperReservedSpawns.delete(host);
      cuaProductHelperTransportSpawns.delete(host);
      if (cuaProductHelperTrackedStart.get(host) === startup) {
        cuaProductHelperTrackedStart.delete(host);
      }
    },
    () => {
      // The caller may already have timed out while the shared 30s startup continued. Its eventual
      // failure must still establish backoff; otherwise every new task immediately repeats install/
      // launch/health work during a persistent failure.
      cuaProductHelperAgentEnvRetryAt.set(host, Date.now() + CUA_PRODUCT_HELPER_AGENT_ENV_RETRY_MS);
      if (cuaProductHelperReservedSpawns.delete(host)) {
        // 有 Agent 拿着预留 tuple 而 Helper 最终没起来 → 仅标记后续 spawn fail-closed，
        // 不反向销毁已有 Agent。
        markCuaProductHelperAgentEnvUnavailable(host);
      }
      if (cuaProductHelperTransportSpawns.delete(host)) {
        markCuaProductHelperAgentEnvUnavailable(host);
      }
      if (cuaProductHelperTrackedStart.get(host) === startup) {
        cuaProductHelperTrackedStart.delete(host);
      }
    },
  );
}


function cuaHelperStartErrorDetail(error: unknown): string {
  return isCuaHelperError(error)
    ? `${error.code}: ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error);
}


export async function buildCuaProductHelperAgentEnv(
  host:
    | (Pick<CuaHelperHost, "start"> &
        Partial<
          Pick<CuaHelperHost, "running" | "checkHealth" | "reservedTransport"> & {
            waitForTransport(timeoutMs?: number): Promise<CuaHelperTransportHandle>;
          }
        >)
    | undefined,
  logger = createServiceLogger("cua-product-helper"),
): Promise<Record<string, string>> {
  if (!host) return {};
  if (hasCuaProductHelperAgentEnvUnavailable(host)) {
    // marker 可能已过时：权限授予或后台冷启动完成后，Helper 已恢复，但内置插件尚未加载，
    // 没有新的 resolver 调用来清理 marker。历史上这会让第二次打开应用仍显示 0 tools。
    // 只做一次有界短探针：健康时清 marker 并下发当前 live tuple，否则立即 fail-closed。
    // 此处和 reconcileRecoveredHelper 都只收敛后续 spawn 的 admission，不回收已有 Agent。
    if (host.running && host.checkHealth) {
      try {
        await host.checkHealth(CUA_PRODUCT_HELPER_SPAWN_READY_DEADLINE_MS);
        clearCuaProductHelperAgentEnvUnavailable(host);
      } catch {
        // helper 仍在恢复（冷启动 / 轮换在途）——不阻塞，交给下一次 demand boundary。
      }
    }
    if (hasCuaProductHelperAgentEnvUnavailable(host)) {
      return {
        [BROKER_UNAVAILABLE_ENV]:
          "broker_unavailable: recovered Helper credentials are waiting for a future spawn",
      };
    }
  }
  const retryAt = cuaProductHelperAgentEnvRetryAt.get(host);
  // 非阻塞设计（用户硬约束）：spawn 绝不卡在冷启动上。warm helper（host.running）走快速
  // checkHealth（1s 上限，健康 helper 毫秒级返回；只有病态 helper 才吃满，可接受）；cold helper
  // 已有安全预留时立即返回，否则走有界 1s deadline race，超时且无预留才 fail-closed 到
  // BROKER_UNAVAILABLE，后台共享 startup 继续收敛。resolver 会在后续 request boundary
  // 只收敛后续 spawn admission，再开放 broker tuple；
  // 绝不从后台 completion 异步打断首个 session，也绝不让 spawn 等 10s。
  //
  // fail-closed 理由：CLI 全局配置里存在 zcode-cua 时，返回空 env 会让 agent 按原始
  // 无 broker 凭据启动 MCP 子进程会绕过已获授权的 Helper broker，让 Python
  // MCP 成为实际 TCC 执行主体。broker 未就绪时必须返回 BROKER_UNAVAILABLE，绝不返回空 env。
  try {
    if (host.running && host.checkHealth) {
      // start() intentionally returns an existing handle without probing. Never spawn a new agent
      // with a dead Helper's stale tuple; the session resolver owns on-demand Helper restart,
      // while this lower-level spawn path fails closed until that recovery completes.
      await host.checkHealth(1000);
      // A successful resolver rotation may have recovered the same host while an earlier spawn
      // failure left a retry marker. Healthy live credentials always supersede stale backoff.
      cuaProductHelperAgentEnvRetryAt.delete(host);
      if (hasCuaProductHelperAgentEnvUnavailable(host)) {
        return {
          [BROKER_UNAVAILABLE_ENV]:
            "broker_unavailable: recovered Helper credentials are waiting for a future spawn",
        };
      }
    } else if (retryAt && Date.now() < retryAt) {
      return {
        [BROKER_UNAVAILABLE_ENV]: "broker_unavailable: helper startup retry is deferred",
      };
    }
    const startup = host.start();
    trackCuaProductHelperStartup(host, startup);
    if (host.waitForTransport) {
      // Windows named pipes cannot reserve/rename a final socket. The Helper sends
      // transport_ready once the pipe is bound; use that tuple while full health
      // (native/UIA initialization) continues in the shared startup promise.
      const transport = await waitForCuaHelperStartup(
        host.waitForTransport(CUA_PRODUCT_HELPER_SPAWN_READY_DEADLINE_MS),
        CUA_PRODUCT_HELPER_SPAWN_READY_DEADLINE_MS,
      );
      if (hasCuaProductHelperAgentEnvUnavailable(host)) {
        return {
          [BROKER_UNAVAILABLE_ENV]:
            "broker_unavailable: recovered Helper credentials are waiting for a future spawn",
        };
      }
      cuaProductHelperTransportSpawns.add(host);
      cuaProductHelperAgentEnvRetryAt.delete(host);
      return {
        [BROKER_SOCKET_ENV]: transport.socketPath,
        [ZCODE_CUA_PLUGIN_AUTHORITY_ENV_KEY]: transport.pluginAuthority,
      };
    }
    // 原来只在 1s 超时后读取预留 tuple，Host 已安全占住 socket 时也会白等。
    // 复用原准入条件提前返回；完整 startup 的失败仍由上面的 tracker 收敛。
    const reserved = host.reservedTransport;
    if (reserved && !hasCuaProductHelperAgentEnvUnavailable(host)) {
      cuaProductHelperReservedSpawns.add(host);
      cuaProductHelperAgentEnvRetryAt.delete(host);
      // 这条 reserved 分支不再下发 BROKER_TOKEN_ENV：broker
      // token 鉴权已整体删除（连接门是代码签名身份）。凭据只剩 socket + authority。
      return {
        [BROKER_SOCKET_ENV]: reserved.socketPath,
        [ZCODE_CUA_PLUGIN_AUTHORITY_ENV_KEY]: reserved.pluginAuthority,
      };
    }
    // 有界 deadline race：cold launch 没在 1s 内 ready 且无预留才 fail-closed。waitForCuaHelperStartup
    // 超时抛 caller_timeout（被下面 catch 当作"后台仍在跑"，不额外设 retryAt）。
    const handle = await waitForCuaHelperStartup(
      startup,
      CUA_PRODUCT_HELPER_SPAWN_READY_DEADLINE_MS,
    );
    // Another concurrent spawn may have timed out while this caller was waiting on the shared
    // startup. Never expose the recovered tuple while the resolver still has a pending admission marker.
    if (hasCuaProductHelperAgentEnvUnavailable(host)) {
      return {
        [BROKER_UNAVAILABLE_ENV]:
          "broker_unavailable: recovered Helper credentials are waiting for a future spawn",
      };
    }
    cuaProductHelperAgentEnvRetryAt.delete(host);
    return {
      [BROKER_SOCKET_ENV]: handle.socketPath,
      [ZCODE_CUA_PLUGIN_AUTHORITY_ENV_KEY]: handle.pluginAuthority,
    };
  } catch (error) {
    // caller_timeout 仅表示共享的 30s startup 仍在后台运行；trackCuaProductHelperStartup 会在其
    // 真正失败时建立 backoff。这里提前退避会让已经 ready 的 Helper 仍被后续 Agent 错误禁用。
    const isCallerTimeout = isCuaHelperError(error) && error.code === "caller_timeout";
    if (isCallerTimeout) {
      // 冷启动 rendezvous：Helper 还在起，但 host 已经占住 final socket 并预留了 tuple。
      // 此时下发的凭据是**可用**的——final 上是 host 占位，未验签的 Helper 绑在 .pending
      // 上够不到它；client 连上占位会被立刻 destroy 并按 broker_unavailable 退避重试，
      // Helper 验证通过后 host 原子 rename 让渡，重试自然落到真 Helper 上。
      //
      // 这条分支存在的意义：Helper 未 ready 时只拒绝本次 Agent 的 CUA MCP admission；
      // Helper ready 后仍只影响后续 Agent spawn，不能通过 lifecycle 操作连带冲掉已有会话。
      const reserved = host.reservedTransport;
      if (reserved && !hasCuaProductHelperAgentEnvUnavailable(host)) {
        // 上面的 unavailable marker 检查优先：未完成 admission 收敛时不放出 tuple。
        cuaProductHelperReservedSpawns.add(host);
        cuaProductHelperAgentEnvRetryAt.delete(host);
        return {
          [BROKER_SOCKET_ENV]: reserved.socketPath,
          [ZCODE_CUA_PLUGIN_AUTHORITY_ENV_KEY]: reserved.pluginAuthority,
        };
      }
    }
    markCuaProductHelperAgentEnvUnavailable(host);
    const helperFailureEnv: Record<string, string> = {
      [BROKER_UNAVAILABLE_ENV]: isCallerTimeout
        ? // 冷启动仍在后台跑——"warming up"，reconcileRecoveredHelper 会在 helper ready 后
          // 只清理后续 spawn marker。
          "broker_unavailable: helper broker warming up"
        : `broker_unavailable: ${cuaHelperStartErrorDetail(error)}`,
    };
    if (!isCallerTimeout) {
      // Helper 真的起不来（F3-2）：CE 构建不随包携带 cua-helper —— macOS 的
      // resources/cua-helper/*.app 与 Windows 的 resources/tools/cua-helper 都不在
      // electron-builder.config.js:580-667 的 extraResources 里，也没有 runtime-manifest.json
      // 的生产者 —— 因此 win32 的 acquire 分支必然落在这一跳。官方 Helper 只是 Computer Use
      // 的凭据来源，不是门控：在开源驱动支持的平台上改用懒铸造契约
      // （socket + config-provenance authority），与上面 darwin 懒启动分支同口径，
      // 让 node-repl-host 的 trycua 路径照常可用。
      const openSourceEnv = resolveCuaProductHelperSpawnEnv(helperFailureEnv);
      if (openSourceEnv !== helperFailureEnv) {
        // 作用域：只有真的回落到铸造契约时才清退避。下面未铸造的分支（开源驱动不支持该平台）
        // 仍然走原来的 30s 退避——那里代表"真实存在的 Helper 反复启动失败"，退避仍然必要。
        // 铸造则意味着不再依赖 Helper transport，留着退避反而有害：窗口内的后续 spawn 会在
        // 本函数 :1173 拿到 "helper startup retry is deferred" envelope、又被判成"无凭据"，
        // Windows 会退化成"每个退避窗口（CUA_PRODUCT_HELPER_AGENT_ENV_RETRY_MS，见 :549 = 30s）
        // 只有一次会话能用电脑控制"。
        cuaProductHelperAgentEnvRetryAt.delete(host);
        logger.warn(
          undefined,
          `Computer Use Helper unavailable; using the open-source driver credential contract instead (${cuaHelperStartErrorDetail(error)})`,
        );
        return openSourceEnv;
      }
      cuaProductHelperAgentEnvRetryAt.set(host, Date.now() + CUA_PRODUCT_HELPER_AGENT_ENV_RETRY_MS);
    }
    logger.warn(
      undefined,
      `Computer Use Helper broker_unavailable; disabling workspace zcode-cua MCP server for this agent spawn (${cuaHelperStartErrorDetail(error)})`,
    );
    return helperFailureEnv;
  }
}

