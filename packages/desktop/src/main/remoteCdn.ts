import { ZCODE_VERSION, type ZCodeEnv } from "@zcode/shared";

declare const __ZCODE_REMOTE_CDN_RELEASE_ROOTS__: readonly string[] | undefined;
declare const __ZCODE_CDN_BASE_URL__: string | undefined;

const DEFAULT_CDN_BASE_URL = "https://cdn-zcode.z.ai";

export interface ResolveRemoteCdnOptions {
  env?: ZCodeEnv;
  locale?: string;
  timeZone?: string;
  overrideBaseUrl?: string;
  version?: string;
  now?: Date;
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // 配置写错时的典型形态：只写了域名（`cdn.example.com`）漏了协议 —— `new URL` 只会抛裸的
    // `Invalid URL`，维护者据此查不出是哪一项配置的问题。这里换成可行动的报错。
    throw new Error(
      `远程资产 CDN 基址无法解析：${value} —— must use http or https，并要带上协议（例如 https://cdn.example.com）`,
    );
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("CDN URL must use http or https");
  return value.replace(/\/+$/, "");
}

/**
 * 解析远程运行时资产的基址。优先级：
 *   1. `overrideBaseUrl`（运行期 `ZCODE_REMOTE_ASSET_CDN_BASE_URL` / 用户设置，见 remoteCdnOverrides.ts）
 *   2. `ZCODE_CDN_BASE_URL`（运行期 env 或构建期 define `__ZCODE_CDN_BASE_URL__`）
 *   3. 官方构建期注入的有序发布根（`__ZCODE_REMOTE_CDN_RELEASE_ROOTS__`；社区版构建不注入）
 *   4. 官方 CDN 默认值
 *
 * 语义（2026-09-23 修正）：**自定义旋钮的值都是"发布根"，按字面值使用** —— 即客户端会在
 * `<发布根>/<版本>/manifest-<platform>.json` 与 `<发布根>/components/...` 取资源。
 * 修正前构建期旋钮被当成父目录并追加 `/zcode/electron/releases/<版本>`，与
 * docs/development/remote-workspace.md 的契约矛盾（自建发布根会 404）。
 * **只有官方默认值与官方注入根**保留/拼接自己的路径前缀（官方 CDN 的资源确实挂在那个前缀下）。
 *
 * 官方 3.15.1 的「国内/海外双 CDN 按语言+时区失效转移」与「test 产品环境内网根」是 z.ai 内部
 * 发布设施（cdn.codegeex.cn / intranet.example.invalid），社区版不接入 —— 未设旋钮时固定回落
 * 官方默认单根（契约见 test/remoteCdnBaseUrl.test.ts 与 test/remoteAssetCdnSettingPriority.test.ts）。
 */
export function resolveRemoteCdnBaseUrls(options: ResolveRemoteCdnOptions = {}): string[] {
  const override = options.overrideBaseUrl?.trim();
  if (override) return [normalizeBaseUrl(override)];
  const customBaseUrl =
    process.env.ZCODE_CDN_BASE_URL?.trim() ||
    (typeof __ZCODE_CDN_BASE_URL__ === "undefined" ? "" : __ZCODE_CDN_BASE_URL__);
  if (customBaseUrl) return [normalizeBaseUrl(customBaseUrl)];

  const version = options.version ?? ZCODE_VERSION;

  const configuredReleaseRoots =
    typeof __ZCODE_REMOTE_CDN_RELEASE_ROOTS__ === "undefined"
      ? []
      : __ZCODE_REMOTE_CDN_RELEASE_ROOTS__;
  if (configuredReleaseRoots.length > 0) {
    // 官方 CI 按构建期 CDN_DOMAIN/OSS_PATH_PREFIX 注入有序发布根，切换官方 CDN 时只改 CI 变量；
    // 仍保留官方「根 + 版本前缀」的拼接语义。
    return configuredReleaseRoots.map(
      (releaseRoot) => `${normalizeBaseUrl(releaseRoot)}/${version}`,
    );
  }

  return [`${normalizeBaseUrl(DEFAULT_CDN_BASE_URL)}/zcode/electron/releases/${version}`];
}

export function resolvePrimaryRemoteCdnBaseUrl(
  options: ResolveRemoteCdnOptions = {},
): string | undefined {
  return resolveRemoteCdnBaseUrls(options)[0];
}
