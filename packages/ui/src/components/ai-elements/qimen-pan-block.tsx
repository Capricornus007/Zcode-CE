import type { QimenPanDocument, QimenPanPalace } from "@zcode/shared";
import { QIMEN_GONG_NAMES, QIMEN_PAN_LAYOUT } from "@zcode/shared";
import { memo, useMemo } from "react";
import { cn } from "@/components/lib/utils.js";

/**
 * ```qimen 围栏的原生盘面渲染（spec: docs/development/136-qimen-pan-fence.md）。
 *
 * 洛书九宫 3×3（巽4 离9 坤2 / 震3 中5 兑7 / 艮8 坎1 乾6），每宫按「神/星/干/门/
 * 干组/格局/四害」分区；字段缺失留白（拆补/置闰、转盘/飞盘体系差异大，宽容显示）。
 * 四害红标、空亡角标、格局按吉凶档位着色——全部走主题语义 token，深浅色自动适配。
 */

/** 格局吉凶着色：按档位文本前缀归类，未知档位不着色。 */
function gejuLuckClass(luck: string | undefined): string {
  if (!luck) return "";
  if (luck.startsWith("大吉") || luck.startsWith("吉")) {
    return "text-success";
  }
  if (luck.startsWith("凶")) {
    return "text-destructive";
  }
  return "text-foreground-subtle";
}

const PalaceCell = memo(function PalaceCell({ palace }: { palace: QimenPanPalace }) {
  const name = palace.name ?? QIMEN_GONG_NAMES[palace.gong] ?? String(palace.gong);
  const isCenter = palace.gong === 5;
  const hasSihai = (palace.sihai?.length ?? 0) > 0;
  const gejuClass = gejuLuckClass(palace.geju?.luck);

  return (
    <div
      className={cn(
        "relative flex min-h-28 flex-col gap-0.5 rounded-lg border bg-card p-2",
        hasSihai ? "border-destructive/50" : "border-border",
      )}
      data-qimen-palace={palace.gong}
    >
      {/* 首行：宫名 | 八神 */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-ui-xs font-medium text-foreground-subtle">{name}</span>
        {palace.shen ? (
          <span className="text-ui-xs text-foreground">{palace.shen}</span>
        ) : null}
      </div>

      {/* 中段：九星 + 天盘/地盘干（盘面视觉主体） */}
      <div className="flex flex-1 flex-col items-center justify-center gap-0.5">
        {palace.star ? (
          <span className="text-ui-base font-medium text-foreground">{palace.star}</span>
        ) : null}
        {palace.tianGan || palace.diGan ? (
          <span className="font-mono text-ui-lg tracking-widest text-foreground">
            {palace.tianGan ?? "　"}
            <span className="text-foreground-subtlest">/</span>
            {palace.diGan ?? "　"}
          </span>
        ) : null}
      </div>

      {/* 门 + 干组（暗干/引干/含干） */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-ui-sm text-foreground">{palace.door ?? ""}</span>
        <span className="truncate font-mono text-ui-xs text-foreground-subtle">
          {[
            palace.angan ? `暗${palace.angan}` : null,
            palace.yingan?.length ? `引${palace.yingan.join("")}` : null,
            palace.hanGan ? `含${palace.hanGan}` : null,
          ]
            .filter(Boolean)
            .join(" ")}
        </span>
      </div>

      {/* 底行：格局 + 四害 + 角标（空亡/马星/寄宫） */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {palace.geju ? (
          <span className={cn("text-ui-xs", gejuClass)}>{palace.geju.name}</span>
        ) : null}
        {hasSihai ? (
          <span className="text-ui-xs font-medium text-destructive">
            {palace.sihai?.join("/")}
          </span>
        ) : null}
        {palace.maxing ? (
          <span className="text-ui-xs text-warning">{palace.maxing}</span>
        ) : null}
        {palace.kongwang ? (
          <span className="text-ui-xs text-foreground-subtlest">空亡</span>
        ) : null}
        {isCenter && palace.note ? (
          <span className="text-ui-xs text-foreground-subtlest">{palace.note}</span>
        ) : null}
        {palace.qushu ? (
          <span className="ml-auto text-ui-xs text-foreground-subtlest">{palace.qushu}</span>
        ) : null}
      </div>
    </div>
  );
});

/** 盘面主体：标题 + 元信息行 + 九宫格。数据缺省逐项留白。 */
export const QimenPanBlock = memo(function QimenPanBlock({
  document,
}: {
  document: QimenPanDocument;
}) {
  const palaceByGong = useMemo(() => {
    const map = new Map<number, QimenPanPalace>();
    for (const palace of document.palaces) {
      map.set(palace.gong, palace);
    }
    return map;
  }, [document.palaces]);

  const meta = document.meta;
  const title =
    document.title ??
    (meta?.yinyang && meta?.ju
      ? `${meta.yinyang}遁${meta.ju}局${meta.yuan ? `·${meta.yuan}` : ""}`
      : undefined);

  return (
    <div className="flex flex-col gap-2 p-1" data-qimen-pan="">
      {(title || meta) && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1">
          {title ? (
            <span className="text-ui-sm font-medium text-foreground">{title}</span>
          ) : null}
          {meta?.date ? (
            <span className="text-ui-xs text-foreground-subtle">{meta.date}</span>
          ) : null}
          {meta?.jieqi ? (
            <span className="text-ui-xs text-foreground-subtle">节气 {meta.jieqi}</span>
          ) : null}
          {meta?.ganzhi ? (
            <span className="font-mono text-ui-xs text-foreground-subtle">
              {[
                meta.ganzhi.year,
                meta.ganzhi.month,
                meta.ganzhi.day,
                meta.ganzhi.hour,
              ]
                .filter(Boolean)
                .join(" ")}
            </span>
          ) : null}
          {meta?.zhifuStar ? (
            <span className="text-ui-xs text-foreground-subtle">
              值符 {meta.zhifuStar}
            </span>
          ) : null}
          {meta?.zhishiDoor ? (
            <span className="text-ui-xs text-foreground-subtle">
              值使 {meta.zhishiDoor}
            </span>
          ) : null}
          {meta?.kongwangTime?.length ? (
            <span className="text-ui-xs text-foreground-subtlest">
              空亡 {meta.kongwangTime.join("")}
            </span>
          ) : null}
          {meta?.maxingDay || meta?.maxingHour ? (
            <span className="text-ui-xs text-foreground-subtlest">
              马星 {[meta.maxingDay, meta.maxingHour].filter(Boolean).join("/")}
            </span>
          ) : null}
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {QIMEN_PAN_LAYOUT.flat().map((gong) => {
          const palace = palaceByGong.get(gong);
          // 缺宫留白壳（体系可能只给八宫，中五宫常缺）。
          return palace ? (
            <PalaceCell key={gong} palace={palace} />
          ) : (
            <div
              key={gong}
              aria-hidden
              className="min-h-28 rounded-lg border border-dashed border-border/60"
            />
          );
        })}
      </div>
    </div>
  );
});
