import type { LiurenPanChuan, LiurenPanDocument, LiurenPanKeColumn } from "@zcode/shared";
import { memo, useMemo } from "react";
import { cn } from "@/components/lib/utils.js";

/**
 * ```liuren 围栏的原生盘面渲染（spec: docs/development/138-qimen-pan-fence.md 六壬节）。
 *
 * 大六壬盘面：三传（初/中/末，传位是断课主线）+ 四课（干阳/干阴/支阳/支阴四列，
 * 天将乘上神、遁干注下、下神为日干/日支或上一位上神）。字段缺失留白（宽容显示）；
 * 空亡支角标、天将用徽标、主题语义 token 深浅色自适应。
 */

const CHUAN_POSITION_CLASS: Record<string, string> = {
  初传: "text-warning",
  中传: "text-foreground",
  末传: "text-foreground-subtle",
};

/** 神煞 chip 渲染上限：实排可达 90+ 项，全部渲染会把盘面撑爆。 */
const SHENSHA_CHIP_LIMIT = 16;

function isKongwang(zhi: string, kongwang: readonly string[] | undefined): boolean {
  return Boolean(kongwang?.some((k) => zhi.startsWith(k)));
}

const ChuanCell = memo(function ChuanCell({
  chuan,
  kongwang,
}: {
  chuan: LiurenPanChuan;
  kongwang?: readonly string[];
}) {
  const kw = isKongwang(chuan.zhi, kongwang);
  return (
    <div
      className={cn(
        "flex min-h-24 flex-col items-center justify-center gap-0.5 rounded-lg border bg-card p-2 md:min-h-28",
        kw ? "border-destructive/50" : "border-border",
      )}
      data-liuren-chuan={chuan.position}
    >
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "text-ui-xs font-medium",
            CHUAN_POSITION_CLASS[chuan.position] ?? "text-foreground-subtle",
          )}
        >
          {chuan.position}
        </span>
        {chuan.jiang ? (
          <span className="rounded bg-foreground/10 px-1 text-ui-xs text-foreground">
            {chuan.jiang}
          </span>
        ) : null}
        {kw ? <span className="text-ui-xs text-destructive">空</span> : null}
      </div>
      <span className="font-mono text-ui-xl text-foreground">{chuan.zhi}</span>
      <span className="font-mono text-ui-xs text-foreground-subtle">
        {[chuan.dun ? `遁${chuan.dun}` : null, chuan.liuqin ?? null, chuan.wangshuai ?? null]
          .filter(Boolean)
          .join(" ")}
      </span>
    </div>
  );
});

const KeColumn = memo(function KeColumn({
  column,
  index,
  kongwang,
}: {
  column: LiurenPanKeColumn;
  index: number;
  kongwang?: readonly string[];
}) {
  const kw = isKongwang(column.shang, kongwang);
  const labels = ["一课", "二课", "三课", "四课"];
  return (
    <div
      className={cn(
        "flex min-h-24 flex-col items-center justify-center gap-0.5 rounded-lg border bg-card p-2 md:min-h-28",
        kw ? "border-destructive/50" : "border-border",
      )}
      data-liuren-ke={index + 1}
    >
      <div className="flex items-center gap-1">
        <span className="text-ui-xs text-foreground-subtlest">{labels[index] ?? ""}</span>
        {column.jiang ? (
          <span className="rounded bg-foreground/10 px-1 text-ui-xs text-foreground">
            {column.jiang}
          </span>
        ) : null}
        {kw ? <span className="text-ui-xs text-destructive">空</span> : null}
      </div>
      <span className="font-mono text-ui-xl text-foreground">{column.shang}</span>
      {column.dun ? (
        <span className="font-mono text-ui-xs text-foreground-subtle">遁{column.dun}</span>
      ) : null}
      <span className="font-mono text-ui-sm text-foreground-subtle">
        {column.xia}
        {column.xiaLabel ? (
          <span className="ml-0.5 text-ui-xs text-foreground-subtlest">{column.xiaLabel}</span>
        ) : null}
      </span>
    </div>
  );
});

/** 盘面主体：标题 + 元信息条 + 三传行 + 四课行 + 本命行年/神煞。 */
export const LiurenPanBlock = memo(function LiurenPanBlock({
  document,
}: {
  document: LiurenPanDocument;
}) {
  const meta = document.meta;
  const kongwang = meta?.kongwang;
  const title =
    document.title ??
    (meta?.siganzhi?.day && meta?.zhanshi ? `${meta.siganzhi.day}日 ${meta.zhanshi}时` : undefined);

  return (
    <div className="flex flex-col gap-2 p-1" data-liuren-pan="">
      {(title || meta) && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1">
          {title ? <span className="text-ui-sm font-medium text-foreground">{title}</span> : null}
          {meta?.method ? (
            <span className="text-ui-xs text-warning">取三传：{meta.method}</span>
          ) : null}
          {meta?.siganzhi ? (
            <span className="font-mono text-ui-xs text-foreground-subtle">
              {[meta.siganzhi.year, meta.siganzhi.month, meta.siganzhi.day, meta.siganzhi.hour]
                .filter(Boolean)
                .join(" ")}
            </span>
          ) : null}
          {meta?.yuejiang ? (
            <span className="text-ui-xs text-foreground-subtle">月将 {meta.yuejiang}</span>
          ) : null}
          {meta?.kongwang?.length ? (
            <span className="text-ui-xs text-foreground-subtlest">
              空亡 {meta.kongwang.join("、")}
            </span>
          ) : null}
          {meta?.keti?.length ? (
            <span className="text-ui-xs text-foreground-subtle">课体 {meta.keti.join("+")}</span>
          ) : null}
          {meta?.benming ? (
            <span className="text-ui-xs text-foreground-subtlest">本命 {meta.benming}</span>
          ) : null}
          {meta?.xingnian ? (
            <span className="text-ui-xs text-foreground-subtlest">行年 {meta.xingnian}</span>
          ) : null}
        </div>
      )}

      {/* 三传（断课主线，置于四课上方） */}
      <div>
        <div className="px-1 pb-1 text-ui-xs text-foreground-subtlest">三传</div>
        <div className="grid grid-cols-3 gap-1.5">
          {document.sanchuan.map((chuan) => (
            <ChuanCell key={chuan.position} chuan={chuan} kongwang={kongwang} />
          ))}
        </div>
      </div>

      {/* 四课 */}
      <div>
        <div className="px-1 pb-1 text-ui-xs text-foreground-subtlest">四课</div>
        <div className="grid grid-cols-4 gap-1.5">
          {document.sike.map((column, index) => (
            <KeColumn key={index} column={column} index={index} kongwang={kongwang} />
          ))}
        </div>
      </div>

      {/* 神煞 chips（载荷可能上百项：渲染截断防盘面膨胀，JSON 全量留给模型读） */}
      {document.shensha && Object.keys(document.shensha).length > 0
        ? (() => {
            const entries = Object.entries(document.shensha);
            const visible = entries.slice(0, SHENSHA_CHIP_LIMIT);
            return (
              <div className="flex flex-wrap gap-1 px-1" data-liuren-shensha="">
                {visible.map(([name, desc]) => (
                  <span
                    key={name}
                    className="rounded border border-border bg-surface px-1.5 py-0.5 text-ui-xs text-foreground-subtle"
                  >
                    {name}
                    {desc ? `:${desc}` : ""}
                  </span>
                ))}
                {entries.length > SHENSHA_CHIP_LIMIT ? (
                  <span className="px-1 py-0.5 text-ui-xs text-foreground-subtlest">
                    …等 {entries.length} 项
                  </span>
                ) : null}
              </div>
            );
          })()
        : null}
    </div>
  );
});
