import { describe, expect, it } from "vitest";

import type { RegistryOption } from "../types";
import { ARTICLE_DENSITIES, ARTICLE_EXTENSION_TYPES, ARTICLE_PALETTES, ARTICLE_PRESETS, ARTICLE_STYLES, ARTICLE_TYPES, ARTICLE_UPSTREAM_TYPES } from "./article-illustrator";
import { COMIC_ART_STYLES, COMIC_ASPECT_RATIOS, COMIC_DIALOGUE_DENSITIES, COMIC_LAYOUT_PANEL_RULES, COMIC_LAYOUTS, COMIC_NARRATION_DENSITIES, COMIC_PARTIAL_MODES, COMIC_PRESETS, COMIC_READING_DIRECTIONS, COMIC_TEXT_MODES, COMIC_TONES } from "./comic";
import { COVER_ASPECT_RATIOS, COVER_FONTS, COVER_MOODS, COVER_PALETTES, COVER_PRESETS, COVER_RENDERINGS, COVER_TEXT_MODES, COVER_TYPES } from "./cover-image";
import { defaultSkillOptions, DESIGN_SKILLS, designSkillById, skillOptionById } from "./design-skills";
import { DIAGRAM_COLOR_ROLES, DIAGRAM_EXTENSION_TYPES, DIAGRAM_RASTER_SEMANTIC_RULES, DIAGRAM_TYPES, DIAGRAM_UPSTREAM_TYPES } from "./diagram";
import { INFOGRAPHIC_ASPECT_RATIOS, INFOGRAPHIC_LAYOUTS, INFOGRAPHIC_SHORTCUTS, INFOGRAPHIC_STYLES } from "./infographic";
import {
    XHS_BACKGROUNDS,
    XHS_CANVAS_RATIOS,
    XHS_CUTOUTS,
    XHS_DIRECTIONS,
    XHS_DIVIDERS,
    XHS_DOODLES,
    XHS_EMPHASIS_MARKS,
    XHS_FILTERS,
    XHS_FRAMES,
    XHS_GRIDS,
    XHS_LAYOUTS,
    XHS_OUTLINE_STRATEGIES,
    XHS_PALETTES,
    XHS_PRESETS,
    XHS_STICKERS,
    XHS_STROKES,
    XHS_STYLES,
    XHS_TAGS,
    XHS_TEXT_DECORATIONS,
    XHS_TEXT_EFFECTS,
} from "./xhs-images";

function ids(options: RegistryOption[]) {
    return options.map((option) => option.id);
}

function expectIds(options: RegistryOption[], expected: string[]) {
    expect(ids(options)).toEqual(expected);
    expect(new Set(ids(options)).size).toBe(options.length);
}

function compatibilityMark(option: RegistryOption, peerKey: string, peerId: string) {
    if (option.compatibility.preferredWith?.[peerKey]?.includes(peerId)) return "2";
    if (option.compatibility.incompatibleWith?.[peerKey]?.includes(peerId)) return "x";
    return "1";
}

function expectBidirectionalMatrix(rows: RegistryOption[], columns: RegistryOption[], rowPeerKey: string, columnPeerKey: string, expectedRows: Readonly<Record<string, string>>) {
    expect(Object.keys(expectedRows)).toEqual(rows.map((option) => option.id));
    for (const row of rows) {
        const expected = expectedRows[row.id];
        expect(expected, `${row.id} matrix row`).toHaveLength(columns.length);
        columns.forEach((column, index) => {
            expect(compatibilityMark(row, rowPeerKey, column.id), `${row.id} × ${column.id}`).toBe(expected[index]);
            expect(compatibilityMark(column, columnPeerKey, row.id), `${column.id} × ${row.id}`).toBe(expected[index]);
        });
    }
}

const CANONICAL_OPTION_SETS: RegistryOption[][] = [
    COVER_TYPES,
    COVER_PALETTES,
    COVER_RENDERINGS,
    COVER_TEXT_MODES,
    COVER_MOODS,
    COVER_FONTS,
    COVER_ASPECT_RATIOS,
    COVER_PRESETS,
    XHS_STYLES,
    XHS_LAYOUTS,
    XHS_PALETTES,
    XHS_OUTLINE_STRATEGIES,
    XHS_CANVAS_RATIOS,
    XHS_PRESETS,
    XHS_GRIDS,
    XHS_CUTOUTS,
    XHS_STROKES,
    XHS_FILTERS,
    XHS_TEXT_DECORATIONS,
    XHS_TAGS,
    XHS_DIRECTIONS,
    XHS_TEXT_EFFECTS,
    XHS_EMPHASIS_MARKS,
    XHS_BACKGROUNDS,
    XHS_DOODLES,
    XHS_FRAMES,
    XHS_DIVIDERS,
    XHS_STICKERS,
    INFOGRAPHIC_LAYOUTS,
    INFOGRAPHIC_STYLES,
    INFOGRAPHIC_ASPECT_RATIOS,
    INFOGRAPHIC_SHORTCUTS,
    ARTICLE_TYPES,
    ARTICLE_STYLES,
    ARTICLE_PALETTES,
    ARTICLE_DENSITIES,
    ARTICLE_PRESETS,
    COMIC_ART_STYLES,
    COMIC_TONES,
    COMIC_LAYOUTS,
    COMIC_ASPECT_RATIOS,
    COMIC_READING_DIRECTIONS,
    COMIC_TEXT_MODES,
    COMIC_DIALOGUE_DENSITIES,
    COMIC_NARRATION_DENSITIES,
    COMIC_PARTIAL_MODES,
    COMIC_PRESETS,
    DIAGRAM_TYPES,
    DIAGRAM_COLOR_ROLES,
];

describe("baoyu registry canonical option sets", () => {
    it("keeps the exact cover-image option sets", () => {
        expectIds(COVER_TYPES, ["hero", "conceptual", "typography", "metaphor", "scene", "minimal"]);
        expectIds(COVER_PALETTES, ["warm", "elegant", "cool", "dark", "earth", "vivid", "pastel", "mono", "retro", "duotone", "macaron"]);
        expectIds(COVER_RENDERINGS, ["flat-vector", "hand-drawn", "painterly", "digital", "pixel", "chalk", "screen-print"]);
        expectIds(COVER_TEXT_MODES, ["none", "title-only", "title-subtitle", "text-rich"]);
        expectIds(COVER_MOODS, ["subtle", "balanced", "bold"]);
        expectIds(COVER_FONTS, ["clean", "handwritten", "serif", "display"]);
        expectIds(COVER_ASPECT_RATIOS, ["16:9", "2.35:1", "4:3", "3:2", "1:1", "3:4"]);
        expectIds(COVER_PRESETS, [
            "elegant",
            "blueprint",
            "chalkboard",
            "dark-atmospheric",
            "editorial-infographic",
            "fantasy-animation",
            "flat-doodle",
            "intuition-machine",
            "minimal",
            "nature",
            "notion",
            "pixel-art",
            "playful",
            "retro",
            "sketch-notes",
            "vector-illustration",
            "vintage",
            "warm",
            "warm-flat",
            "hand-drawn-edu",
            "watercolor",
            "poster-art",
            "mondo",
            "art-deco",
            "propaganda",
            "cinematic",
        ]);
    });

    it("keeps the exact XHS core and preset option sets", () => {
        expectIds(XHS_STYLES, ["cute", "fresh", "warm", "bold", "minimal", "retro", "pop", "notion", "chalkboard", "study-notes", "screen-print", "sketch-notes"]);
        expectIds(XHS_LAYOUTS, ["sparse", "balanced", "dense", "list", "comparison", "flow", "mindmap", "quadrant"]);
        expectIds(XHS_PALETTES, ["macaron", "warm", "neon"]);
        expectIds(XHS_OUTLINE_STRATEGIES, ["story-driven", "information-dense", "visual-first"]);
        expectIds(XHS_CANVAS_RATIOS, ["portrait-3-4", "square", "portrait-2-3"]);
        expectIds(XHS_PRESETS, [
            "knowledge-card",
            "checklist",
            "concept-map",
            "swot",
            "tutorial",
            "classroom",
            "study-guide",
            "hand-drawn-edu",
            "sketch-card",
            "sketch-summary",
            "cute-share",
            "girly",
            "cozy-story",
            "product-review",
            "nature-flow",
            "warning",
            "versus",
            "clean-quote",
            "pro-summary",
            "retro-ranking",
            "throwback",
            "pop-facts",
            "hype",
            "poster",
            "editorial",
            "cinematic",
        ]);
    });

    it("keeps the exact XHS ancillary visual tokens", () => {
        expectIds(XHS_GRIDS, ["single", "dual", "triptych", "quad", "six-grid", "nine-grid"]);
        expectIds(XHS_CUTOUTS, ["none", "clean", "soft", "stylized", "silhouette"]);
        expectIds(XHS_STROKES, ["none", "white-solid", "colored-solid", "dashed", "double", "glow", "shadow"]);
        expectIds(XHS_FILTERS, ["none", "clear-glow", "film-grain", "cream-skin", "japanese-magazine", "high-saturation", "muted-tones", "warm-tone", "cool-tone", "halftone", "print-grain", "natural-photo"]);
        expectIds(XHS_TEXT_DECORATIONS, ["none", "gradient", "stroke-text", "shadow-3d", "highlight", "neon", "handwritten", "bubble", "brush"]);
        expectIds(XHS_TAGS, ["none", "black-white", "white-black", "bubble", "pointer", "ribbon", "stamp", "pill"]);
        expectIds(XHS_DIRECTIONS, ["horizontal", "vertical", "curved", "diagonal"]);
        expectIds(XHS_TEXT_EFFECTS, ["shadow", "outline", "glow", "underline-wavy", "strikethrough"]);
        expectIds(XHS_EMPHASIS_MARKS, ["red-arrow", "circle-mark", "underline", "star-burst", "checkmark", "cross-mark", "exclamation", "question", "numbering", "bracket"]);
        expectIds(XHS_BACKGROUNDS, ["solid-saturated", "solid-pastel", "gradient-linear", "gradient-radial", "frosted-glass", "paper-texture", "fabric-texture", "chalkboard", "grid", "dots"]);
        expectIds(XHS_DOODLES, ["hand-drawn-lines", "stars-sparkles", "flowers", "hearts", "clouds", "arrows-curvy", "squiggles", "confetti", "leaves", "bubbles"]);
        expectIds(XHS_FRAMES, ["polaroid", "film-strip", "phone-screenshot", "torn-paper", "rounded-rect", "decorative", "tape-corners", "stamp-border"]);
        expectIds(XHS_DIVIDERS, ["line-simple", "line-dashed", "line-wavy", "dots-row", "ornamental"]);
        expectIds(XHS_STICKERS, ["badge-new", "badge-hot", "badge-sale", "seal-quality", "ribbon-award", "tag-price"]);
    });

    it("keeps all 21 infographic layouts and 22 styles", () => {
        expectIds(INFOGRAPHIC_LAYOUTS, [
            "linear-progression",
            "binary-comparison",
            "comparison-matrix",
            "hierarchical-layers",
            "tree-branching",
            "hub-spoke",
            "structural-breakdown",
            "bento-grid",
            "iceberg",
            "bridge",
            "funnel",
            "isometric-map",
            "dashboard",
            "periodic-table",
            "comic-strip",
            "story-mountain",
            "jigsaw",
            "venn-diagram",
            "winding-roadmap",
            "circular-flow",
            "dense-modules",
        ]);
        expectIds(INFOGRAPHIC_STYLES, [
            "craft-handmade",
            "claymation",
            "kawaii",
            "storybook-watercolor",
            "chalkboard",
            "cyberpunk-neon",
            "bold-graphic",
            "aged-academia",
            "corporate-memphis",
            "technical-schematic",
            "origami",
            "pixel-art",
            "ui-wireframe",
            "subway-map",
            "ikea-manual",
            "knolling",
            "lego-brick",
            "pop-laboratory",
            "morandi-journal",
            "retro-pop-grid",
            "hand-drawn-edu",
            "retro-popup-pop",
        ]);
        expectIds(INFOGRAPHIC_ASPECT_RATIOS, ["landscape", "portrait", "square"]);
        expectIds(INFOGRAPHIC_SHORTCUTS, ["high-density-info", "infographic"]);
    });

    it("keeps all upstream article options plus the requested Luffy type extensions", () => {
        expectIds(ARTICLE_UPSTREAM_TYPES, ["infographic", "scene", "flowchart", "comparison", "framework", "timeline"]);
        expectIds(ARTICLE_EXTENSION_TYPES, ["conceptual", "metaphor", "data", "decorative"]);
        expectIds(ARTICLE_TYPES, ["infographic", "scene", "flowchart", "comparison", "framework", "timeline", "conceptual", "metaphor", "data", "decorative"]);
        expectIds(ARTICLE_STYLES, [
            "vector-illustration",
            "notion",
            "elegant",
            "warm",
            "minimal",
            "blueprint",
            "watercolor",
            "editorial",
            "scientific",
            "chalkboard",
            "fantasy-animation",
            "flat",
            "flat-doodle",
            "intuition-machine",
            "nature",
            "pixel-art",
            "playful",
            "retro",
            "sketch",
            "screen-print",
            "sketch-notes",
            "ink-notes",
            "vintage",
        ]);
        expectIds(ARTICLE_PALETTES, ["macaron", "warm", "neon", "mono-ink"]);
        expectIds(ARTICLE_DENSITIES, ["minimal", "balanced", "per-section", "rich"]);
        expectIds(ARTICLE_PRESETS, [
            "tech-explainer",
            "system-design",
            "architecture",
            "science-paper",
            "knowledge-base",
            "saas-guide",
            "tutorial",
            "process-flow",
            "warm-knowledge",
            "edu-visual",
            "hand-drawn-edu",
            "hand-drawn-edu-flow",
            "hand-drawn-edu-compare",
            "ink-notes-compare",
            "ink-notes-flow",
            "ink-notes-framework",
            "data-report",
            "versus",
            "business-compare",
            "storytelling",
            "lifestyle",
            "history",
            "evolution",
            "opinion-piece",
            "editorial-poster",
            "cinematic",
        ]);
    });

    it("keeps all comic dimensions and preset expansions", () => {
        expectIds(COMIC_ART_STYLES, ["ligne-claire", "manga", "realistic", "ink-brush", "chalk", "minimalist"]);
        expectIds(COMIC_TONES, ["neutral", "warm", "dramatic", "romantic", "energetic", "vintage", "action"]);
        expectIds(COMIC_LAYOUTS, ["standard", "cinematic", "dense", "splash", "mixed", "webtoon", "four-panel"]);
        expectIds(COMIC_ASPECT_RATIOS, ["3:4", "4:3", "16:9"]);
        expectIds(COMIC_READING_DIRECTIONS, ["left-to-right", "right-to-left", "top-to-bottom"]);
        expectIds(COMIC_TEXT_MODES, ["with-text", "no-text"]);
        expectIds(COMIC_DIALOGUE_DENSITIES, ["low", "medium", "high"]);
        expectIds(COMIC_NARRATION_DENSITIES, ["low", "medium", "high"]);
        expectIds(COMIC_PARTIAL_MODES, ["storyboard-only", "prompts-only", "images-only", "regenerate"]);
        expectIds(COMIC_PRESETS, ["ohmsha", "wuxia", "shoujo", "concept-story", "four-panel"]);
        expect(COMIC_LAYOUT_PANEL_RULES["four-panel"]).toEqual({ min: 4, max: 4, reading: "left-to-right" });
        expect(COMIC_LAYOUT_PANEL_RULES.webtoon).toEqual({ min: 3, max: 5, reading: "top-to-bottom" });
    });

    it("keeps upstream diagram semantics and all requested raster extensions", () => {
        expectIds(DIAGRAM_UPSTREAM_TYPES, ["architecture", "flowchart", "sequence", "structural", "mind-map", "timeline", "illustrative", "state-machine", "data-flow"]);
        expectIds(DIAGRAM_EXTENSION_TYPES, ["system-architecture", "tech-stack", "module-relations", "research-schematic", "hierarchy", "causal", "cycle", "comparison", "network"]);
        expectIds(DIAGRAM_TYPES, [
            "architecture",
            "flowchart",
            "sequence",
            "structural",
            "mind-map",
            "timeline",
            "illustrative",
            "state-machine",
            "data-flow",
            "system-architecture",
            "tech-stack",
            "module-relations",
            "research-schematic",
            "hierarchy",
            "causal",
            "cycle",
            "comparison",
            "network",
        ]);
        expectIds(DIAGRAM_COLOR_ROLES, ["primary", "secondary", "tertiary", "accent", "alert", "connector", "neutral", "highlight"]);
    });
});

describe("baoyu fixed-SHA compatibility matrices", () => {
    const coverMatrixPalettes = COVER_PALETTES.filter((option) => option.id !== "macaron");
    const articleMatrixStyleIds = ["sketch-notes", "vector-illustration", "notion", "warm", "minimal", "blueprint", "watercolor", "elegant", "editorial", "scientific", "screen-print"];
    const articleMatrixStyles = articleMatrixStyleIds.map((id) => ARTICLE_STYLES.find((option) => option.id === id)!);

    it("translates every Cover Palette×Rendering and Type×Rendering cell in both directions", () => {
        expectBidirectionalMatrix(coverMatrixPalettes, COVER_RENDERINGS, "rendering", "palette", {
            warm: "2211111",
            elegant: "1212xx1",
            cool: "21x2111",
            dark: "1112122",
            earth: "1221xx1",
            vivid: "2111212",
            pastel: "2221xxx",
            mono: "21x2112",
            retro: "22121x2",
            duotone: "1xx1xx2",
        });
        expectBidirectionalMatrix(COVER_TYPES, COVER_RENDERINGS, "rendering", "type", {
            hero: "1222112",
            conceptual: "21x2111",
            typography: "2112112",
            metaphor: "1221x12",
            scene: "x1211x1",
            minimal: "2112xx2",
        });
    });

    it("translates every Cover Type×Text, Type×Mood and Font×Rendering cell in both directions", () => {
        expectBidirectionalMatrix(COVER_TYPES, COVER_TEXT_MODES, "textMode", "type", {
            hero: "1221",
            conceptual: "2211",
            typography: "x122",
            metaphor: "211x",
            scene: "211x",
            minimal: "221x",
        });
        expectBidirectionalMatrix(COVER_TYPES, COVER_MOODS, "mood", "type", {
            hero: "122",
            conceptual: "221",
            typography: "122",
            metaphor: "221",
            scene: "221",
            minimal: "22x",
        });
        expectBidirectionalMatrix(COVER_FONTS, COVER_RENDERINGS, "rendering", "font", {
            clean: "2xx21x1",
            handwritten: "1221x2x",
            serif: "1x12xx1",
            display: "2112212",
        });
    });

    it("translates every Article Type×Style cell in both directions", () => {
        expectBidirectionalMatrix(ARTICLE_UPSTREAM_TYPES, articleMatrixStyles, "style", "illustrationType", {
            infographic: "22212212221",
            scene: "x1121x211x2",
            flowchart: "222112x121x",
            comparison: "22212112211",
            framework: "222122x2121",
            timeline: "11211122211",
        });
    });

    it("preserves representative recommendations, incompatibilities and explicit matrix omissions", () => {
        const elegant = COVER_PALETTES.find((option) => option.id === "elegant")!;
        expect(elegant.compatibility.preferredWith?.rendering).toEqual(["hand-drawn", "digital"]);
        expect(elegant.compatibility.incompatibleWith?.rendering).toEqual(["pixel", "chalk"]);

        const scene = COVER_TYPES.find((option) => option.id === "scene")!;
        expect(scene.compatibility.preferredWith?.rendering).toEqual(["painterly"]);
        expect(scene.compatibility.incompatibleWith?.rendering).toEqual(["flat-vector", "chalk"]);
        expect(scene.compatibility.incompatibleWith?.textMode).toEqual(["text-rich"]);

        const minimal = COVER_TYPES.find((option) => option.id === "minimal")!;
        expect(minimal.compatibility.incompatibleWith?.mood).toEqual(["bold"]);

        const handwritten = COVER_FONTS.find((option) => option.id === "handwritten")!;
        expect(handwritten.compatibility.preferredWith?.rendering).toContain("chalk");
        expect(handwritten.compatibility.incompatibleWith?.rendering).toContain("screen-print");

        const articleScene = ARTICLE_UPSTREAM_TYPES.find((option) => option.id === "scene")!;
        expect(articleScene.compatibility.preferredWith?.style).toEqual(["warm", "watercolor", "screen-print"]);
        expect(articleScene.compatibility.incompatibleWith?.style).toEqual(["sketch-notes", "blueprint", "scientific"]);

        const sha = "6b7a2e417500561a5ecdd0b168332f4142584617";
        for (const option of [...COVER_TYPES, ...coverMatrixPalettes, ...COVER_RENDERINGS, ...COVER_TEXT_MODES, ...COVER_MOODS, ...COVER_FONTS, ...ARTICLE_UPSTREAM_TYPES, ...articleMatrixStyles]) {
            expect(option.compatibility.notes.join(" ")).toContain(sha);
        }
        expect(COVER_PALETTES.find((option) => option.id === "macaron")?.compatibility.notes.join(" ")).toContain("未列出 palette=macaron");
        expect(ARTICLE_EXTENSION_TYPES.find((option) => option.id === "conceptual")?.compatibility.notes.join(" ")).toContain("未列出 illustrationType=conceptual");
        expect(ARTICLE_STYLES.find((option) => option.id === "flat")?.compatibility.notes.join(" ")).toContain("未列出 style=flat");
    });
});

describe("design skill definitions", () => {
    it("exports all seven skills exactly once", () => {
        expect(DESIGN_SKILLS.map((skill) => skill.id)).toEqual(["none", "cover-image", "xhs-images", "infographic", "article-illustrator", "comic", "diagram"]);
        expect(new Set(DESIGN_SKILLS.map((skill) => skill.id)).size).toBe(7);
    });

    it("has unique group keys, valid defaults and required option fields", () => {
        for (const skill of DESIGN_SKILLS) {
            const keys = skill.optionGroups.map((group) => group.key);
            expect(new Set(keys).size, `${skill.id} option group keys`).toBe(keys.length);
            expect(defaultSkillOptions(skill.id)).toEqual(Object.fromEntries(skill.optionGroups.map((group) => [group.key, group.defaultValue])));

            for (const group of skill.optionGroups) {
                if (!group.options) continue;
                expect(new Set(ids(group.options)).size, `${skill.id}.${group.key} option ids`).toBe(group.options.length);
                expect(
                    group.options.some((option) => option.id === group.defaultValue),
                    `${skill.id}.${group.key} default`,
                ).toBe(true);
            }
        }

        const runtimeOptions = [...CANONICAL_OPTION_SETS.flat(), ...DESIGN_SKILLS.flatMap((skill) => skill.optionGroups.flatMap((group) => group.options || []))];
        for (const option of runtimeOptions) {
            expect(option.id).toBeTruthy();
            expect(option.nameZh).toBeTruthy();
            expect(option.nameEn).toBeTruthy();
            expect(option.description).toBeTruthy();
            expect(option.useCases.length).toBeGreaterThan(0);
            expect(option.promptFragment).toBeTruthy();
            expect(option.negativeFragment).toBeTruthy();
            expect(option.recommendation.keywords.length).toBeGreaterThan(0);
            expect(option.recommendation.reason).toBeTruthy();
            expect(option.compatibility.notes.length).toBeGreaterThan(0);
        }
    });

    it("supports Luffy wrapper options without mixing them into canonical sets", () => {
        expect(skillOptionById("cover-image", "palette", "style-default")?.nameZh).toBe("跟随风格");
        expect(skillOptionById("xhs-images", "style", "custom")?.nameZh).toBe("自定义");
        expect(skillOptionById("infographic", "layout", "auto")?.nameZh).toBe("自动推荐");
        expect(skillOptionById("article-illustrator", "palette", "style-default")?.nameZh).toBe("跟随风格");
        expect(skillOptionById("comic", "readingDirection", "right-to-left")?.id).toBe("right-to-left");
        expect(skillOptionById("diagram", "diagramType", "custom")?.nameZh).toBe("自定义");
        expect(ids(COVER_PALETTES)).not.toContain("style-default");
        expect(ids(XHS_STYLES)).not.toContain("custom");
    });

    it("falls back to the none skill for unknown ids", () => {
        expect(designSkillById("missing").id).toBe("none");
        expect(defaultSkillOptions("missing")).toEqual({});
        expect(skillOptionById("missing", "style", "auto")).toBeUndefined();
    });

    it("keeps raster diagram prompts free of code-format and vendor tails", () => {
        const promptText = [...DIAGRAM_TYPES.flatMap((option) => [option.promptFragment, option.negativeFragment]), ...Object.values(DIAGRAM_RASTER_SEMANTIC_RULES), designSkillById("diagram").compositionFragment].join("\n");
        expect(promptText).not.toMatch(/\b(svg|mermaid|html|canvas|provider)\b|nano banana/i);
        expect(promptText).toContain("位图");
    });

    it("keeps XHS prompt fragments vendor-neutral", () => {
        const promptText = XHS_PRESETS.flatMap((option) => [option.promptFragment, option.negativeFragment]).join("\n");
        expect(promptText).not.toMatch(/\bprovider\b|nano banana/i);
    });
});
