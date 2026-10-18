# 146 · Desktop 开发重启耗时

## 现状

`pnpm dev:desktop` 每次重启都走完整链路：

1. `@zcode/desktop pre-dev`：准备 runtime assets，并**删除 `packages/desktop/out`**；
2. `scripts/build-desktop-agent-cli.mjs`：按固定顺序逐个 `pnpm --filter <pkg> build`，每个包都是完整 `tsc`（shared-types → contracts → dynamic-workflow → dynamic-workflow-runtime → core → adapters → i18n → bootstrap → node-repl-host → browser-use-plugin → cli）；
3. `dev:runtime`：tsup 全量构建 main/host/scheduler，Vite 起 dev server，Electron 等三个 ready marker。

实测冷重启约 4–5 分钟，主要耗时在 2（串行全量 tsc）和 3（out 被删后 tsup 全量构建）。

## 优化入口

### `pnpm dev:desktop:turbo`

CLI 构建改走 turbo（`ZCODE_DESKTOP_AGENT_BUILD_MODE=turbo`），按包缓存：

- 源码没变的包直接命中缓存；
- 只重建变更包及其依赖；
- 实测缓存全热时 `build-desktop-agent-cli` 从 ~90s 降到 **7.1s**（含重新 stage agent bundle/payloads）。

### `pnpm dev:desktop:fast`

跳过 CLI 构建，复用现有 `apps/zcode-cli/packages/cli/dist/zcode.cjs`，只跑 pre-dev + `dev:runtime`。

适用：只改 `packages/ui` / `packages/desktop` 的 renderer、main、host；**不适用**于改 `core`、`bootstrap`、`contracts`、`shared` 等 CLI 侧代码（会拿到旧 CLI）。脚本在 dist 缺失时直接报错，不会静默启动旧副本。

### 不重启的情况

renderer 改动由 Vite HMR 直接生效，不需要重启。只有 main/host/CLI 或依赖包变化才需要走完整重启。

## 验收

- `node scripts/dev-desktop-env.mjs production --turbo` 走 turbo；`--skip-agent-build` 跳过 CLI 构建且缺 dist 时失败；
- 缓存全热时 CLI 构建 < 10s；
- `dev:desktop` 原行为不变（无 flag 时仍走顺序 pnpm 构建，兼容无 turbo 的环境）。

## 未做

- 把 turbo 设为默认：Linux 容器 demo 可能没有仓库级 turbo，保持显式 opt-in；
- 跳过 `pre-dev` 删除 `out`：ready marker 与 bundle 新旧绑定，保留清理避免 Electron 读到半完成产物。
