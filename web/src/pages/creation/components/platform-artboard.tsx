import { useMemo, type CSSProperties } from "react";

import type { SocialPlatformPreset } from "@/constant/creation";
import { buildCardRenderPlan, type CardRect, type CardTextPrimitive } from "@/lib/creation/card-render";
import type { CreationCardPage } from "@/types/creation";

type PlatformArtboardProps = {
    page: CreationCardPage;
    preset: SocialPlatformPreset;
    imageUrl?: string;
    showSafeArea: boolean;
};

export function PlatformArtboard({ page, preset, imageUrl, showSafeArea }: PlatformArtboardProps) {
    const plan = useMemo(() => buildCardRenderPlan({ page, preset }), [page, preset]);

    return (
        <div
            className="relative isolate w-full overflow-hidden rounded-[18px] border border-stone-300 bg-stone-200 shadow-[0_24px_70px_rgba(28,25,23,.16)] [container-type:inline-size] dark:border-stone-700 dark:bg-stone-900 dark:shadow-[0_24px_70px_rgba(0,0,0,.38)]"
            style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
            aria-label={`${preset.label}：${page.title || "未命名页面"}`}
        >
            {imageUrl ? (
                <img src={imageUrl} alt="" draggable={false} className="absolute inset-0 size-full select-none object-cover" />
            ) : (
                <div className="absolute inset-0 bg-[linear-gradient(145deg,#d6d3d1_0%,#a8a29e_52%,#78716c_100%)] dark:bg-[linear-gradient(145deg,#44403c_0%,#292524_52%,#1c1917_100%)]" />
            )}

            {plan.primitives.map((primitive, index) => {
                if (primitive.kind === "background") return null;
                if (primitive.kind === "overlay") return <div key={`overlay-${index}`} className="absolute" style={{ ...rectStyle(primitive.rect, plan.width, plan.height), background: primitive.fill }} />;
                return <ArtboardText key={`${primitive.role}-${index}`} primitive={primitive} width={plan.width} height={plan.height} />;
            })}

            {showSafeArea ? <SafeAreaOverlay preset={preset} /> : null}
        </div>
    );
}

function ArtboardText({ primitive, width, height }: { primitive: CardTextPrimitive; width: number; height: number }) {
    const style: CSSProperties = {
        ...rectStyle(primitive.rect, width, height),
        color: primitive.color,
        fontFamily: primitive.fontFamily,
        fontSize: `${(primitive.fontSize / width) * 100}cqw`,
        fontWeight: primitive.fontWeight,
        lineHeight: primitive.lineHeight / primitive.fontSize,
        textAlign: primitive.align === "start" ? "left" : primitive.align === "end" ? "right" : primitive.align,
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: primitive.maxLines,
        overflow: "hidden",
        textShadow: "0 1px 12px rgba(0,0,0,.24)",
        wordBreak: "break-word",
    };
    return (
        <div className={primitive.role === "title" ? "absolute tracking-[-0.035em]" : "absolute tracking-[0.01em]"} style={style}>
            {primitive.text}
        </div>
    );
}

function SafeAreaOverlay({ preset }: { preset: SocialPlatformPreset }) {
    const { top, right, bottom, left } = preset.safeArea;
    const topPercent = percent(top, preset.height);
    const rightPercent = percent(right, preset.width);
    const bottomPercent = percent(bottom, preset.height);
    const leftPercent = percent(left, preset.width);

    return (
        <div className="pointer-events-none absolute inset-0 z-30 text-white" aria-hidden="true" data-testid="platform-safe-area">
            <div className="absolute inset-x-0 top-0 bg-amber-300/12" style={{ height: topPercent }} />
            <div className="absolute inset-x-0 bottom-0 bg-amber-300/12" style={{ height: bottomPercent }} />
            <div className="absolute bottom-0 left-0 top-0 bg-amber-300/12" style={{ width: leftPercent }} />
            <div className="absolute bottom-0 right-0 top-0 bg-amber-300/12" style={{ width: rightPercent }} />
            <div className="absolute border border-dashed border-amber-200/95 shadow-[0_0_0_1px_rgba(0,0,0,.2),inset_0_0_0_1px_rgba(255,255,255,.16)]" style={{ top: topPercent, right: rightPercent, bottom: bottomPercent, left: leftPercent }} />
            <div className="absolute left-2 top-2 max-w-[calc(100%-16px)] rounded bg-black/68 px-2 py-1 text-[clamp(8px,2.5cqw,11px)] font-medium leading-tight shadow-sm backdrop-blur-sm">
                安全区 · 上 {top}px / 右 {right}px / 下 {bottom}px / 左 {left}px
            </div>
            {preset.notes.length ? <div className="absolute bottom-2 left-2 right-2 rounded bg-black/68 px-2 py-1 text-[clamp(8px,2.35cqw,10px)] leading-snug shadow-sm backdrop-blur-sm">{preset.notes.join(" · ")}</div> : null}
        </div>
    );
}

function rectStyle(rect: CardRect, width: number, height: number): CSSProperties {
    return {
        left: percent(rect.x, width),
        top: percent(rect.y, height),
        width: percent(rect.width, width),
        height: percent(rect.height, height),
    };
}

function percent(value: number, dimension: number) {
    return `${(value / dimension) * 100}%`;
}
