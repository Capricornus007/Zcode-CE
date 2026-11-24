#!/usr/bin/env python3
"""
ZCode 官方闭源 4.0.0 app.asar 遥测出口手术。
完全遵循上游 Capricornus007/Zcode-CE 的 CE 政策：
  aur/zcode-ce-rebuild/README.md + docs/development/telemetry.md
等价上游 commit be778822（ARMS SDK 不初始化、preload 桥接不安装、localTtft OTLP exporter 移除）
与 surgery.py（3.18.2）在 4.0.0 上的适配版。

手术点（4.0.0 chunk 名与 3.18.2 不同，按内容定位）：
  1. out/main/chunk-HH7N2YVI.js — OTLP endpoint / license key headers / service name
     -> 清空，RUNTIME_DISTRIBUTION="community-no-telemetry"
  2. out/main/chunk-IERSWOXK.js — yw (ARMS RUM web URL) / bw (event report URL) / Sw=!0
     -> 清空 yw/bw，Sw=!0 -> !1（对应 3.18.2 的 dw/pw/mw）
守门 xt=!!(endpoint||...) 与 if(!endpoint)return{} 令整条 telemetry 链短路。
按 CE 政策：host/main renderer 仍保留 @arms/rum-* SDK 档（无出口、不初始化），与 CE 做法一致。
"""
import re, shutil, os, sys

# 工作目录可用第一个参数或 ZCODE_SURGERY_SRC 环境变量指定（便于自动构建/CI 调用）。
# 默认值为本地复现路径。
SRC = (sys.argv[1] if len(sys.argv) > 1
       else os.environ.get('ZCODE_SURGERY_SRC', '/home/avatar/zcode40/asar-src'))
F_OTLP = os.path.join(SRC, 'out/main/chunk-HH7N2YVI.js')
F_ARMS = os.path.join(SRC, 'out/main/chunk-IERSWOXK.js')

def patch(path, transforms, label):
    if not os.path.exists(path):
        print(f'::error:: 找不到 {path}', file=sys.stderr)
        sys.exit(2)
    shutil.copy2(path, path + '.orig')
    s = open(path, encoding='utf-8').read()
    orig = s
    for pattern, repl, desc in transforms:
        new, n = re.subn(pattern, repl, s)
        print(f'  [{label}] {desc}: {n} 处')
        if n == 0:
            print(f'::warn:: {desc} 未匹配（可能版本差异）', file=sys.stderr)
        s = new
    open(path, 'w', encoding='utf-8').write(s)
    return s != orig

print('=== 手术 1/2: OTLP 出口 (chunk-HH7N2YVI.js) ===')
patch(F_OTLP, [
    (r'OTEL_EXPORTER_OTLP_ENDPOINT:"https://proj-xtrace-[^"]*aliyuncs\.com[^"]*"',
     'OTEL_EXPORTER_OTLP_ENDPOINT:""', 'OTLP endpoint 清空'),
    (r'OTEL_EXPORTER_OTLP_HEADERS:"[^"]*x-arms-license-key[^"]*"',
     'OTEL_EXPORTER_OTLP_HEADERS:""', 'license key headers 清空'),
    (r'OTEL_SERVICE_NAME:"zcode-cli-agent"',
     'OTEL_SERVICE_NAME:""', 'service name 清空'),
    (r'ZCODE_TELEMETRY_RUNTIME_DISTRIBUTION:"packaged"',
     'ZCODE_TELEMETRY_RUNTIME_DISTRIBUTION:"community-no-telemetry"',
     'runtime distribution 标记'),
], 'OTLP')

print('=== 手术 2/2: ARMS RUM + event report (chunk-IERSWOXK.js) ===')
patch(F_ARMS, [
    (r'"https://proj-xtrace-[^"]*aliyuncs\.com/rum/web/v2\?[^"]*"',
     '""', 'ARMS RUM web URL (yw) 清空'),
    (r'"https://zcode\.z\.ai/api/v1/event/report"',
     '""', 'event report URL (bw) 清空'),
    (r'Sw=!0', 'Sw=!1', 'telemetry 开关 (Sw) 关闭'),
], 'ARMS')

print('=== 手术 3/3: 移除 ARMS 初始化日志 (out/main/index.js) ===')
F_MAIN = os.path.join(SRC, 'out/main/index.js')
shutil.copy2(F_MAIN, F_MAIN + '.orig')
s = open(F_MAIN, encoding='utf-8').read()
s2 = re.sub(r'v\.info\(`\[arms\] electron initialized[^`]*`\)', 'void 0', s)
n = len(s) - len(s2)
print(f'  ARMS 初始化日志移除: {1 if s2 != s else 0} 处')
open(F_MAIN, 'w', encoding='utf-8').write(s2)

print('=== 验证 ===')
def count_file(kw, root):
    n = 0
    for dp, _, fs in os.walk(root):
        for f in fs:
            # 排除手术脚本生成的 .orig 备份
            if f.endswith(('.js', '.cjs', '.mjs')) and not f.endswith('.orig'):
                try:
                    if kw in open(os.path.join(dp, f), encoding='utf-8', errors='ignore').read():
                        n += 1
                except Exception:
                    pass
    return n

# 与上游 CE telemetry.md 验证一致：
#  - proj-xtrace / x-arms-license-key / aliyuncs.com/rum/web 是遥测出口 -> 必须 0
#  - aliyuncs.com 的 OSS/CDN 白名单（验证码/云认证）属保留项，不在此列
#  - electron initialized / ARMS_RUM / otlp-exporter 是移除标记 -> 必须 0
checks = {
    'x-arms-license-key': 0,
    'proj-xtrace': 0,
    'aliyuncs.com/apm/trace/opentelemetry': 0,
    'aliyuncs.com/rum/web/v2': 0,
    'zcode.z.ai/api/v1/event/report': 0,
    'electron initialized': 0,
    'ARMS_RUM': 0,
    'otlp-exporter': 0,
}
ok = True
for kw, expect in checks.items():
    n = count_file(kw, os.path.join(SRC, 'out'))
    status = 'OK' if n == expect else 'FAIL'
    if n != expect:
        ok = False
    print(f'  [{status}] {kw}: {n} (期望 {expect})')
if not ok:
    print('::error:: 遥测手术验证未通过', file=sys.stderr)
    sys.exit(3)
print('遥测出口手术完成并通过验证')
