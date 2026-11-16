#!/usr/bin/env python3
"""ZCode 3.18.2 閉源 deb 手術：清空遙測出口配置（等價 CE 的 ARMS/OTLP 收口）。"""
import re, shutil, os

F = '/tmp/zcode-deb-work/asar-src/out/main/chunk-HH7N2YVI.js'
shutil.copy(F, F + '.orig')

s = open(F, encoding='utf-8').read()
orig = s

# 1) 硬編碼 ARMS/OTLP 端點 + headers -> 清空（守門 xt=!!(endpoint) 自然短路）
s = s.replace(
    'OTEL_EXPORTER_OTLP_ENDPOINT:"https://proj-xtrace-7e235817c9b9381c22d8b743908d469f-cn-beijing.cn-beijing.log.aliyuncs.com/apm/trace/opentelemetry"',
    'OTEL_EXPORTER_OTLP_ENDPOINT:""')
s = re.sub(r'OTEL_EXPORTER_OTLP_HEADERS:"x-arms-license-key=[^"]*"',
           'OTEL_EXPORTER_OTLP_HEADERS:""', s)
s = re.sub(r'OTEL_SERVICE_NAME:"zcode-cli-agent"', 'OTEL_SERVICE_NAME:""', s)
s = s.replace('ZCODE_TELEMETRY_RUNTIME_DISTRIBUTION:"packaged"',
              'ZCODE_TELEMETRY_RUNTIME_DISTRIBUTION:"community-no-telemetry"')

assert s != orig, '沒有匹配到任何遙測配置'
assert 'x-arms-license-key=' not in s, 'license key 仍存在'
assert 'aliyuncs.com' not in s, 'OTLP endpoint 仍存在'

open(F, 'w', encoding='utf-8').write(s)
print('patched', F)
print('剩餘 telemetry 端點引用:', sum(
    'x-arms-license-key' in open(os.path.join(dp, f), encoding='utf-8', errors='ignore').read()
    for dp, _, fs in os.walk('/tmp/zcode-deb-work/asar-src/out') for f in fs if f.endswith('.js')))
