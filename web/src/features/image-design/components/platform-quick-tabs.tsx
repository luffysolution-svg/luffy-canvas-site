import { PLATFORM_LABELS } from "../registry/platform-presets";

export function PlatformQuickTabs({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const options = [{ value: "all", label: "全部" }, ...PLATFORM_LABELS];
    return (
        <div className="hover-scrollbar -mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="平台快捷筛选">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={value === option.value}
                    className={`min-h-10 shrink-0 rounded-md px-2.5 py-1 text-sm transition sm:min-h-8 ${
                        value === option.value ? "!bg-stone-900 !text-white dark:!bg-stone-100 dark:!text-stone-950" : "text-stone-600 hover:bg-black/5 dark:text-stone-300 dark:hover:bg-white/10"
                    }`}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
