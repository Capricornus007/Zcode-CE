# ZCode CE 4.0.0 重組包（官方閉源 AppImage 拆包 + 遙測出口手術）

官方 `zai-org/ZCode` 已發布閉源 **v4.0.0**（開源 tag `v4.0.0` = `a4b44451`）。
本目錄提供從官方 Linux x64 AppImage 重組出「等價 CE 去遙測」pacman 包的完整流程，
保持 `zcode-ce-git` 3.17.2-ce 已發布包的形態（`/opt/ZCode-CE`、`/usr/bin/zcode-ce` 連結、
desktop、hicolor 圖示、`.INSTALL`、零 systemd）。

> 3.18.2 的 deb 版流程見 `README.md` / `surgery.py`；本檔與 `surgery_400.py` 是 4.0.0 AppImage 版。
> CE 政策依據：`docs/development/telemetry.md`（按數據流分類：官方服務+後台自動=刪除；
> 官方服務+用戶主動=可配置；無關=不碰；耦合=剝離遙測保留本地能力）。

## 權威源

- 官方閉源 Linux AppImage（GitHub release 資產頁無 Linux 版，僅官方 CDN）：
  `https://cdn-zcode.z.ai/zcode/electron/releases/4.0.0/linux-x64/ZCode-4.0.0-linux-x64.AppImage`
- 本地實測 SHA256：`2cedc5fceee1ffcc74b00cca292bfa86522cf7201ba8bc93d0c5500b6fefcc47`

## 完整流程

1. 下載 AppImage：`curl -fL -o ZCode-4.0.0-linux-x64.AppImage <上面的 CDN URL>`
2. 解 AppImage：`./ZCode-4.0.0-linux-x64.AppImage --appimage-extract`（得到 `squashfs-root/`）
3. 解 asar：`npx --yes @electron/asar extract squashfs-root/resources/app.asar asar-src`
4. **遙測出口手術**：`python3 surgery_400.py`（見下方手術點與驗證）
5. 重打包 asar：
   `npx --yes @electron/asar pack asar-src out/app.asar --unpack '*.{node,dll,dylib,exe}' --unpack-dir node_modules/node-pty/prebuilds/linux-x64`
   （native 邊界必須與官方一致：ssh2 / node-pty / @napi-rs/keyring / @img/sharp 四個 `.node`）
6. 組 pacman 包：外殼（`.PKGINFO`/`.INSTALL`/desktop/圖示/license/apparmor）取 3.17.2-ce 已發布包，
   內容換成手術後的 AppImage，主二進位 `zcode` 更名 `zcode-ce`，`/usr/bin/zcode-ce` 連結指向它。
   **禁止**跳過第 4 步直接打包原始 asar（會把 ARMS/RUM + OTLP 出口原樣分發）。

## 手術點（4.0.0 chunk 名與 3.18.2 不同，按內容定位）

| 檔案 | 目標 | 處理 |
| ---- | ---- | ---- |
| `out/main/chunk-HH7N2YVI.js` | `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS`(license key) / `OTEL_SERVICE_NAME` / `RUNTIME_DISTRIBUTION` | 清空前三項，distribution 改 `community-no-telemetry` |
| `out/main/chunk-IERSWOXK.js` | `yw`(ARMS RUM web URL) / `bw`(event report URL) / `Sw`(開關 `!0`) | 清空 yw/bw，`Sw=!0→!1`（對應 3.18.2 的 dw/pw/mw） |
| `out/main/index.js` | `[arms] electron initialized` 初始化日誌 | 移除 |

守門 `xt=!!(endpoint||endpoint)` 與 `if(!endpoint)return{}` 令整條 telemetry 鏈自然短路。
host/main renderer 仍保留 `@arms/rum-*` SDK 檔（無出口、不初始化），與 CE 做法一致。

## 驗證（`surgery_400.py` 內建 8 項 + 以下按上游 telemetry.md）

從最終包提取 app.asar 解包後逐項掃描，全部應為 0：

```bash
for kw in 'x-arms-license-key' 'proj-xtrace' \
  'aliyuncs.com/apm/trace/opentelemetry' 'aliyuncs.com/rum/web/v2' \
  'zcode.z.ai/api/v1/event/report' 'electron initialized' 'ARMS_RUM'; do
  echo "$kw = $(grep -rl "$kw" <解包目錄>/ | wc -l)"
done
```

`OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS` 應為空，
`ZCODE_TELEMETRY_RUNTIME_DISTRIBUTION` 應為 `community-no-telemetry`。

預期殘留（**非違規**，與上游 CE 判定一致）：
- `aliyuncs.com` 的 OSS/CDN 域名白名單（驗證碼/雲認證用）。
- `node_modules/@opentelemetry/*` 的 SDK 檔（25 個 `otlp-exporter` 路徑命中，無出口、不初始化；
  Vercel AI SDK 的傳遞依賴，移除會讓 `ai` 解析失敗）。

額外：`pacman -Qp <包>` 識別為 `zcode-ce-git 4.0.0-1`；包內無任何 `systemd`/`sysusers` 路徑。
