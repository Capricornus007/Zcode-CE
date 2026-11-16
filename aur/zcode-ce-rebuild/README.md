# ZCode CE 3.18.2 重組包（官方發行拆包 + 遙測出口收口）

官方 zai-org/ZCode 的 CE 分支尚未發布 3.18.2-ce.x，但其 Linux 發行 `.deb` 已於 3.18.2 發布：
`https://cdn-zcode.z.ai/zcode/electron/releases/3.18.2/linux-x64/ZCode-3.18.2-linux-x64.deb`

本目錄提供從官方 deb 重組出「等價 CE 去遙測」版本的完整流程：

1. `curl` 下載官方 deb → `ar x` + `bsdtar -xf data.tar.xz` 解包
2. `npx @electron/asar extract` 解 `app.asar`
3. `surgery.py` 清空 ARMS/OTLP 出口（endpoint、license key、event report URL、開關旗標），
   等價 CE 提交 `be778822`（ARMS SDK 不初始化、preload 橋接不安裝、localTtft OTLP exporter 移除）
4. `npx @electron/asar pack` 重打包 → 組 pacman 包（`.PKGINFO`/`.MTREE`/`.INSTALL`）
5. 的路徑 `/opt/ZCode-CE`，命令 `zcode-ce`，`conflicts/provides/replaces = zcode-ce-git`

## 手術點（app.asar 內）
- `out/main/chunk-HH7N2YVI.js`: `f` 物件的 `OTEL_EXPORTER_OTLP_ENDPOINT/HEADERS/SERVICE_NAME` 清空
- `out/main/chunk-N4BDK3A6.js`: `dw` (ARMS RUM web URL)、`pw` (event report URL) 清空，`mw=!0 → !1`

守門 `xt=!!(endpoint||endpoint)` 與 `npe()` 的 `if(!endpoint)return{}` 讓整條 telemetry 鏈自然短路。
host/main 的 renderer 仍含 `@arms/rum-*` SDK 檔（無出口，不初始化），與 CE 做法一致。

## 驗證
- `pacman -Q zcode-ce` → `3.18.2-1`
- `grep -c 'x-arms-license-key\|proj-xtrace' /opt/ZCode-CE/resources/app.asar` → 0
- `zcode-ce` 正常啟動
