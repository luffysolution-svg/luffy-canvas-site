import { ExternalLink, ImagePlus, Images } from "lucide-react";

export const PROMPT_GARDEN_LINKS = [
    {
        id: "text-to-image",
        title: "文生图提示词花园",
        description: "浏览文生图模板、效果示例与可复制提示词。",
        href: "https://garden.always200.com/?type=image&generationType=text-to-image#all",
        icon: ImagePlus,
    },
    {
        id: "image-to-image",
        title: "图生图提示词花园",
        description: "浏览图生图模板、参考图用法与改图提示词。",
        href: "https://garden.always200.com/?type=image&generationType=image-to-image#all",
        icon: Images,
    },
] as const;

export function PromptGardenLinks({ compact = false, stacked = false }: { compact?: boolean; stacked?: boolean }) {
    return (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/20" aria-label="Prompt Garden 提示词库">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">Prompt Garden</div>
                    {!compact ? <div className="mt-0.5 text-xs text-emerald-800/80 dark:text-emerald-200/70">在外部提示词花园浏览案例，复制后返回 Luffy Canvas 使用。</div> : null}
                </div>
                <span className="rounded-full border border-emerald-200 bg-white/80 px-2 py-0.5 text-[11px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">外部灵感库</span>
            </div>
            <div className={`mt-3 grid gap-2 ${compact && !stacked ? "sm:grid-cols-2" : compact ? "" : "md:grid-cols-2"}`}>
                {PROMPT_GARDEN_LINKS.map((item) => {
                    const Icon = item.icon;
                    return (
                        <a
                            key={item.id}
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex min-w-0 items-center gap-3 rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-left transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-stone-950 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30"
                        >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200">
                                <Icon className="size-4.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-stone-900 dark:text-stone-100">{item.title}</span>
                                {!compact ? <span className="mt-0.5 block text-xs leading-5 text-stone-500 dark:text-stone-400">{item.description}</span> : null}
                            </span>
                            <ExternalLink className="size-4 shrink-0 text-stone-400 transition group-hover:text-emerald-600 dark:group-hover:text-emerald-300" />
                        </a>
                    );
                })}
            </div>
        </section>
    );
}
