import type { PlatformPreset } from "../types";

export function SafeAreaPreview({ preset }: { preset: PlatformPreset }) {
    const ratio = preset.generationSize.width / preset.generationSize.height;
    const safe = preset.safeArea;
    return (
        <div className="rounded-md border border-stone-200 p-3 dark:border-stone-800">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                <span className="font-medium">安全区预览</span>
                <span className="text-stone-500 dark:text-stone-400">{preset.aspectRatio}</span>
            </div>
            <div className="mx-auto w-full max-w-72 overflow-hidden rounded bg-stone-200 dark:bg-stone-800" style={{ aspectRatio: String(ratio) }}>
                <div className="relative size-full bg-[linear-gradient(90deg,transparent_49.5%,rgba(120,113,108,.18)_50%,transparent_50.5%),linear-gradient(transparent_49.5%,rgba(120,113,108,.18)_50%,transparent_50.5%)]">
                    <div
                        className="absolute border border-dashed border-emerald-600/80 bg-emerald-500/5"
                        style={{
                            top: `${safe.top}%`,
                            right: `${safe.right}%`,
                            bottom: `${safe.bottom}%`,
                            left: `${safe.left}%`,
                        }}
                    />
                    {preset.avoidZones.map((zone) => (
                        <div
                            key={zone.id}
                            className="absolute grid place-items-center overflow-hidden bg-rose-500/20 px-1 text-center text-[9px] leading-tight text-rose-800 dark:text-rose-200"
                            style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%` }}
                            title={zone.label}
                        >
                            {zone.label}
                        </div>
                    ))}
                </div>
            </div>
            <p className="mb-0 mt-2 text-xs leading-5 text-stone-500 dark:text-stone-400">{safe.description}</p>
        </div>
    );
}
