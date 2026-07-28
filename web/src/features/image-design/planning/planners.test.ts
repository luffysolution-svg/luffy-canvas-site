import { describe, expect, it } from "vitest";

import { planArticleIllustrations } from "./article-illustration-planner";
import { planCardSeries } from "./card-series-planner";
import { planComicStoryboard } from "./comic-storyboard-planner";
import { createDesignPlan } from "./create-design-plan";
import { planDiagram } from "./diagram-planner";
import { structureInfographic } from "./infographic-structure";
import { normalizeDesignPlan, stampDesignPlan } from "./plan-state";
import { contentChunks, extractImmutableFacts, sourceSections } from "./text-planning";

const article = `# 市场背景
2025年，样本覆盖 12亿元交易额，核心指标同比增长 37.5%。这一章节解释研究范围、统计口径和使用限制，并补充足够长的背景文字来验证插图计划不会把文章全文直接塞进单张图片提示。

# 方法与流程
第一步收集 2048 条记录，第二步进行清洗，第三步由 6 名研究者复核。方法章节强调先后顺序、输入输出和质量门槛，并说明每一个步骤为何不可跳过。

# 结果
实验组耗时 18min，对照组耗时 32min，准确率从 81% 提升到 93%。结果章节比较差异、收益与代价，并要求图中逐字保留关键数字和单位。

# 结论
建议分三个阶段落地：第1阶段验证假设，第2阶段扩大样本，第3阶段形成标准流程。结论还提醒读者不要把相关性误解为因果关系。`;

describe("text planning primitives", () => {
    it("splits long content by headings and sentences without repeating the whole source", () => {
        const sections = sourceSections(article);
        const chunks = contentChunks(article, 4);

        expect(sections.map((section) => section.heading)).toEqual(["市场背景", "方法与流程", "结果", "结论"]);
        expect(chunks).toHaveLength(4);
        expect(chunks.every((chunk) => chunk.body.length < article.length)).toBe(true);
        expect(chunks.map((chunk) => chunk.body).join("\n")).not.toContain(article);
    });

    it("keeps an explicit series count even when the source is very short", () => {
        expect(contentChunks("一条简短主题", 10)).toHaveLength(10);
    });

    it("preserves numbers together with their units and ordered labels", () => {
        expect(extractImmutableFacts(article)).toEqual(expect.arrayContaining(["2025年", "12亿元", "37.5%", "第一步", "2048", "第二步", "第三步", "6", "18min", "32min", "81%", "93%", "1", "2", "3"]));
    });
});

describe("structured planners", () => {
    it("builds a bounded card series from a long source", () => {
        const source = Array.from({ length: 16 }, (_, index) => `要点 ${index + 1}：解释第 ${index + 1} 个实践原则、常见误区和一个可执行建议。`).join("。");
        const plan = planCardSeries(source, {
            count: 7,
            style: "editorial",
            palette: "cool",
            layout: "balanced",
        });

        expect(plan.items).toHaveLength(7);
        expect(plan.items[0]).toMatchObject({ kind: "cover", order: 0 });
        expect(plan.items.at(-1)).toMatchObject({ kind: "summary", order: 6 });
        expect(plan.items.slice(1, -1).every((item) => item.body.length <= 181)).toBe(true);
        expect(plan.visualBible).toContain("editorial");
        expect(plan.visualBible).toContain("cool");
        expect(plan.items.every((item) => item.body !== source)).toBe(true);
    });

    it("uses three genuinely different XHS outline strategies without dropping source content", () => {
        const source = ["# 开始\n内容标记A：主角遇到问题并记录背景事实。", "# 尝试\n内容标记B：第一次方案失败，留下原因与证据。", "# 转折\n内容标记C：新方法带来变化，并解释关键步骤。", "# 结论\n内容标记D：总结结果、边界和下一步行动。"].join("\n\n");
        const strategies = ["story-driven", "information-dense", "visual-first"] as const;
        const plans = strategies.map((outlineStrategy) => planCardSeries(source, { count: 5, outlineStrategy }));

        for (const plan of plans) {
            expect(plan.items.map((item) => item.kind)).toEqual(["cover", "content", "content", "content", "summary"]);
            const preserved = plan.items
                .filter((item) => item.kind === "content")
                .map((item) => item.body)
                .join("\n");
            expect(preserved).toContain("内容标记A");
            expect(preserved).toContain("内容标记B");
            expect(preserved).toContain("内容标记C");
            expect(preserved).toContain("内容标记D");
        }
        expect(new Set(plans.map((plan) => plan.items.map((item) => item.title).join("|"))).size).toBe(3);
        expect(new Set(plans.map((plan) => plan.items.map((item) => item.purpose).join("|"))).size).toBe(3);
        expect(plans[0].summary).toContain("故事驱动");
        expect(plans[1].summary).toContain("信息密集");
        expect(plans[2].summary).toContain("视觉优先");
    });

    it("plans article illustrations per section and never embeds the full article in an item", () => {
        const plan = planArticleIllustrations(article, {
            count: 4,
            density: "per-section",
            style: "scientific",
            palette: "mono-ink",
        });

        expect(plan.type).toBe("article");
        expect(plan.items).toHaveLength(4);
        expect(plan.items.map((item) => item.chapter)).toEqual(["市场背景", "方法与流程", "结果", "结论"]);
        expect(plan.items.every((item) => item.body !== article && !item.body.includes("# 市场背景"))).toBe(true);
        expect(plan.items.map((item) => item.illustrationType)).toEqual(["infographic", "flowchart", "comparison", "flowchart"]);
        expect(plan.items.flatMap((item) => item.requiredText || [])).toEqual(expect.arrayContaining(["2025年", "12亿元", "37.5%", "18min", "32min", "81%", "93%"]));
        expect(plan.summary.length).toBeLessThan(article.length / 2);
    });

    it("splits unheaded article paragraphs into independently editable illustration items", () => {
        const source = ["市场段落标记A。2026年样本量达到1200条，同比增长37.5%，用于说明研究背景和统计口径。", "方法段落标记B。首先采集数据，然后完成清洗，最后由两名研究者复核。", "结论段落标记C。实验组为91%，对照组为82%，需要比较收益和适用边界。"].join(
            "\n\n",
        );
        const plan = planArticleIllustrations(source, { count: 3, density: "per-section" });

        expect(plan.items).toHaveLength(3);
        expect(plan.items.map((item) => item.body).join("\n")).toContain("市场段落标记A");
        expect(plan.items.map((item) => item.body).join("\n")).toContain("方法段落标记B");
        expect(plan.items.map((item) => item.body).join("\n")).toContain("结论段落标记C");
        expect(plan.items.map((item) => item.illustrationType)).toEqual(["infographic", "flowchart", "comparison"]);
    });

    it("flags overloaded infographics for splitting without deleting immutable facts", () => {
        const source = Array.from({ length: 14 }, (_, index) => `# 模块 ${index + 1}\n第${index + 1}项包含 ${1000 + index} 条记录和 ${20 + index}.5% 的转化率。${"补充结构化说明。".repeat(35)}`).join("\n\n");
        const result = structureInfographic(source, { highDensity: false, dataFidelity: true });

        expect(result.requiresSplit).toBe(true);
        expect(result.warnings.some((warning) => warning.includes("拆成多张"))).toBe(true);
        expect(result.plan.items).toHaveLength(10);
        expect(result.plan.learningGoals).toHaveLength(3);
        expect(result.plan.items[0].requiredText).toEqual(expect.arrayContaining(["第1项", "1000", "20.5%"]));
        expect(result.plan.items.at(-1)?.requiredText).toEqual(expect.arrayContaining(["第14项", "1013", "33.5%"]));
        expect(result.plan.items.at(-1)?.body).toContain("1013");
        expect(result.plan.items.map((item) => item.body).join("\n")).toContain("第1项");
        expect(result.plan.items.map((item) => item.body).join("\n")).toContain("第14项");
    });

    it("really splits a long unheaded infographic source without dropping content", () => {
        const source = Array.from({ length: 120 }, (_, index) => `唯一事实${index + 1}包含${1000 + index}条记录和${20 + index}.5%的转化率。`).join("");
        const result = structureInfographic(source, { highDensity: false, dataFidelity: true });
        const reconstructed = result.plan.items
            .map((item) => item.body)
            .join("")
            .replace(/\s/g, "");

        expect(source.length).toBeGreaterThan(2400);
        expect(result.requiresSplit).toBe(true);
        expect(result.plan.items.length).toBeGreaterThan(1);
        expect(result.plan.items.length).toBeLessThanOrEqual(10);
        expect(reconstructed).toBe(source.replace(/\s/g, ""));
        expect(result.plan.items.at(-1)?.body).toContain("唯一事实120");
    });

    it("creates independent comic panels and preserves supplied dialogue", () => {
        const story = [
            "清晨，林舟走进空荡的车站，说“今天一定要找到答案”。",
            "广播突然响起，工作人员回答“末班车从未离开”。",
            "林舟发现时钟倒转，迅速跑向站台。",
            "列车门打开，童年的自己站在里面。",
            "他停下脚步，低声说“我终于明白了”。",
            "太阳升起，车站恢复喧闹。",
        ].join("。");
        const plan = planComicStoryboard(story, {
            panelCount: 6,
            pageCount: 2,
            readingDirection: "left-to-right",
            layout: "cinematic",
            artStyle: "manga",
            textMode: "with-text",
        });

        expect(plan.items).toHaveLength(6);
        expect(plan.items.map((item) => item.order)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(plan.items.flatMap((item) => item.requiredText || [])).toEqual(expect.arrayContaining(["今天一定要找到答案", "末班车从未离开", "我终于明白了"]));
        expect(plan.summary).toContain("林舟走进空荡的车站");
        expect(plan.summary).toContain("太阳升起，车站恢复喧闹");
        expect(plan.summary).toContain("分镜规划：2 页、6 个独立分镜");
        expect(plan.visualBible).toContain("manga");
        expect(plan.items.every((item) => item.body !== story)).toBe(true);
    });

    it("builds the comic visual bible from custom or inferred characters and settings", () => {
        const story = "林舟走进车站，说“开始吧”。阿岚跑向站台，回答“我来了”。";
        const inferred = planComicStoryboard(story, {
            panelCount: 2,
            artStyle: "manga",
            textMode: "with-text",
        });
        const customized = planComicStoryboard(story, {
            panelCount: 2,
            artStyle: "ligne-claire",
            characters: "林舟：短发、蓝色夹克；阿岚：长发、红色围巾",
            setting: "雨夜旧车站，固定钟楼与一号站台方位",
        });

        expect(inferred.visualBible).toContain("林舟");
        expect(inferred.visualBible).toContain("阿岚");
        expect(inferred.visualBible).toContain("车站");
        expect(inferred.visualBible).toContain("站台");
        expect(customized.visualBible).toContain("短发、蓝色夹克");
        expect(customized.visualBible).toContain("雨夜旧车站");
    });

    it("never creates skipped or empty comic page numbers", () => {
        const plan = planComicStoryboard("林舟进入车站。阿岚跟随。两人找到出口。", {
            panelCount: 3,
            pageCount: 8,
        });

        expect(plan.summary).toContain("分镜规划：3 页、3 个独立分镜");
        expect(plan.items.map((item) => item.chapter)).toEqual(["第 1 页", "第 2 页", "第 3 页"]);
    });

    it("caps raster diagram nodes while retaining source order", () => {
        const source = Array.from({ length: 20 }, (_, index) => `# 节点 ${index + 1}\n节点 ${index + 1} 连接到节点 ${index + 2}。`).join("\n");
        const plan = planDiagram(source, "network");

        expect(plan.items).toHaveLength(16);
        expect(plan.items[0].title).toBe("节点 1");
        expect(plan.items.at(-1)?.title).toBe("节点 19 — 节点 20");
        expect(plan.items.at(-1)?.body).toContain("节点 20");
        expect(plan.summary).toContain("位图");
        expect(plan.items.every((item) => item.visualDescription?.includes("network"))).toBe(true);
    });
});

describe("design plan option semantics", () => {
    it("uses every custom selector companion in plans and visual bibles", () => {
        const xhs = createDesignPlan("xhs-images", "把三个知识点拆成系列图卡", {
            count: 3,
            outlineStrategy: "information-dense",
            preset: "custom",
            customPreset: "每张卡都使用蓝晒档案编号",
            style: "custom",
            customStyle: "蓝晒拼贴",
            layout: "custom",
            customLayout: "左窄右宽双栏",
            palette: "custom",
            customPalette: "靛蓝与米白",
        }).plan!;
        const articlePlan = createDesignPlan(
            "article-illustrator",
            article,
            {
                count: 4,
                density: "minimal",
                illustrationType: "custom",
                customIllustrationType: "实验装置剖面",
                style: "custom",
                customStyle: "工程铅笔稿",
                palette: "custom",
                customPalette: "石墨灰与警示橙",
            },
            ["count"],
        ).plan!;
        const comic = createDesignPlan("comic", "林舟进入车站，随后发现时钟倒转。", {
            panelCount: 2,
            pageCount: 1,
            layout: "custom",
            customLayout: "斜切三段分格",
            artStyle: "custom",
            customArtStyle: "木刻版画",
            tone: "custom",
            customTone: "压抑后释然",
        }).plan!;
        const diagram = createDesignPlan("diagram", "# 输入\n请求\n# 输出\n响应", {
            diagramType: "custom",
            customDiagramType: "双泳道审批图",
        }).plan!;

        expect(xhs.visualBible).toContain("蓝晒拼贴");
        expect(xhs.visualBible).toContain("左窄右宽双栏");
        expect(xhs.visualBible).toContain("靛蓝与米白");
        expect(xhs.visualBible).toContain("每张卡都使用蓝晒档案编号");
        expect(articlePlan.items).toHaveLength(4);
        expect(articlePlan.items.every((item) => item.illustrationType === "实验装置剖面")).toBe(true);
        expect(articlePlan.visualBible).toContain("工程铅笔稿");
        expect(articlePlan.visualBible).toContain("石墨灰与警示橙");
        expect(comic.visualBible).toContain("木刻版画");
        expect(comic.visualBible).toContain("压抑后释然");
        expect(comic.items[0].visualDescription).toContain("斜切三段分格");
        expect(diagram.summary).toContain("双泳道审批图");
        expect(diagram.items[0].visualDescription).toContain("双泳道审批图");
        expect(diagram.summary).not.toContain("流程图");
    });

    it("expands XHS, article and comic presets before building their plans", () => {
        const xhs = createDesignPlan("xhs-images", "分析优势、劣势、机会和风险", {
            preset: "swot",
            style: "auto",
            layout: "auto",
            palette: "style-default",
            outlineStrategy: "information-dense",
            count: 3,
        }).plan!;
        const articlePlan = createDesignPlan("article-illustrator", article, {
            preset: "system-design",
            illustrationType: "auto",
            style: "auto",
            palette: "style-default",
            density: "minimal",
            count: 4,
        }).plan!;
        const comic = createDesignPlan("comic", "老师带学生逐步理解一个编程概念。", {
            preset: "ohmsha",
            artStyle: "auto",
            tone: "auto",
            layout: "auto",
            readingDirection: "left-to-right",
            pageCount: 1,
            panelCount: 3,
            dialogueDensity: "medium",
            narrationDensity: "high",
        }).plan!;
        const explicitDirection = createDesignPlan(
            "comic",
            "老师带学生逐步理解一个编程概念。",
            {
                preset: "ohmsha",
                artStyle: "auto",
                tone: "auto",
                layout: "auto",
                readingDirection: "left-to-right",
                pageCount: 1,
                panelCount: 3,
            },
            ["readingDirection"],
        ).plan!;

        expect(xhs.visualBible).toContain("Notion 知识卡");
        expect(xhs.visualBible).toContain("四象限");
        expect(articlePlan.items).toHaveLength(2);
        expect(articlePlan.items.every((item) => item.illustrationType === "framework")).toBe(true);
        expect(articlePlan.visualBible).toContain("技术蓝图");
        expect(comic.visualBible).toContain("日式漫画");
        expect(comic.visualBible).toContain("原创导师");
        expect(comic.items[0].visualDescription).toContain("版式 条漫");
        expect(comic.items[0].visualDescription).toContain("对话密度 适中");
        expect(comic.items[0].visualDescription).toContain("旁白密度 多");
        expect(comic.items[0].visualDescription).not.toContain("medium");
        expect(comic.summary).toContain("从上到下");
        expect(explicitDirection.summary).toContain("从左到右");
    });

    it("lets article density choose count until the user explicitly fixes a count", () => {
        const minimal = createDesignPlan("article-illustrator", article, { count: 4, density: "minimal" }).plan!;
        const rich = createDesignPlan("article-illustrator", article, { count: 4, density: "rich" }).plan!;
        const explicitFour = createDesignPlan("article-illustrator", article, { count: 4, density: "minimal" }, ["count"]).plan!;
        const explicitThree = createDesignPlan("article-illustrator", article, { count: 3, density: "rich" }, ["count"]).plan!;

        expect(minimal.items).toHaveLength(2);
        expect(rich.items).toHaveLength(6);
        expect(explicitFour.items).toHaveLength(4);
        expect(explicitThree.items).toHaveLength(3);
    });

    it("applies infographic shortcut semantics to the structured visual plan", () => {
        const highDensity = createDesignPlan("infographic", "high-density-info\n# 指标\n转化率 37.5%", {
            layout: "auto",
            style: "auto",
            aspectRatio: "auto",
            highDensity: false,
        }).plan!;
        const generic = createDesignPlan("infographic", "infographic\n# 指标\n转化率 37.5%", {
            layout: "auto",
            style: "auto",
            aspectRatio: "auto",
            highDensity: false,
        }).plan!;
        const explicitLowDensity = createDesignPlan(
            "infographic",
            "high-density-info\n# 指标\n转化率 37.5%",
            {
                layout: "auto",
                style: "auto",
                aspectRatio: "auto",
                highDensity: false,
            },
            ["highDensity"],
        ).plan!;

        expect(highDensity.visualBible).toContain("高密度模块");
        expect(highDensity.visualBible).toContain("莫兰迪手账");
        expect(highDensity.visualBible).toContain("竖版 9:16");
        expect(generic.visualBible).toContain("便当网格");
        expect(generic.visualBible).toContain("手工纸艺");
        expect(generic.visualBible).toContain("横版 16:9");
        expect(explicitLowDensity.visualBible).toContain("优先清晰层级");
    });
});

describe("structured plan state", () => {
    it("preserves a manually edited visual bible while refreshing automatic visual rules", () => {
        const prompt = "把一篇产品方法论拆成三张知识卡";
        const initialOptions = { count: 3, style: "fresh", layout: "balanced", palette: "warm" };
        const initial = stampDesignPlan(planCardSeries(prompt, initialOptions), "xhs-images", prompt, initialOptions)!;
        const manual = { ...initial, visualBible: "用户手动锁定的角色、配色和字体规则。" };
        const nextOptions = { ...initialOptions, style: "retro" };

        expect(normalizeDesignPlan(manual, "xhs-images", prompt, nextOptions)?.visualBible).toBe(manual.visualBible);
        expect(normalizeDesignPlan(initial, "xhs-images", prompt, nextOptions)?.visualBible).not.toBe(initial.visualBible);
    });

    it("invalidates a plan when a shaping option changes", () => {
        const prompt = "三张知识卡";
        const options = { count: 3, style: "fresh" };
        const plan = stampDesignPlan(planCardSeries(prompt, options), "xhs-images", prompt, options);

        expect(normalizeDesignPlan(plan, "xhs-images", prompt, { ...options, count: 4 })).toBeNull();
    });

    it("invalidates a plan when a default-valued planner option becomes explicit", () => {
        const options = { count: 4, density: "minimal" };
        const plan = stampDesignPlan(createDesignPlan("article-illustrator", article, options).plan, "article-illustrator", article, options);

        expect(plan?.items).toHaveLength(2);
        expect(normalizeDesignPlan(plan, "article-illustrator", article, options, ["count"])).toBeNull();
    });
});
