import type { StructuredPlan, StructuredPlanItem } from "../types";
import { groupSourceSections, planId, shortTitle, sourceDigest, sourceSections } from "./text-planning";

export function planDiagram(source: string, diagramType = "flowchart", diagramTypeLabel = diagramType): StructuredPlan {
    const text = source.trim();
    const sections = sourceSections(text);
    const grouped = groupSourceSections(sections, 16);
    const items: StructuredPlanItem[] = grouped.map((section, index) => ({
        id: `node-${index + 1}`,
        order: index,
        kind: "section",
        title: section.heading || `节点 ${index + 1}`,
        body: section.body,
        purpose: relationPurpose(diagramType, index),
        visualDescription: `作为“${diagramTypeLabel}”中的独立节点，标签简短清晰，并与相邻节点使用明确箭头或关系线连接。`,
    }));

    return {
        id: planId("diagram", text),
        type: "diagram",
        title: shortTitle(text, 30),
        summary: `按“${diagramTypeLabel}”组织为 ${items.length} 个主要节点；最终仍由图片模型生成位图结果。`,
        visualBible: "technical schematic；精确层级；清楚箭头；统一图标语言；标签易读；关系线不得穿过节点；画布边缘留足安全空间。",
        items,
        sourceDigest: sourceDigest(text),
    };
}

function relationPurpose(type: string, index: number) {
    if (type === "timeline") return "作为时间轴上的事件节点，保持先后顺序";
    if (type === "hierarchy") return index === 0 ? "作为根层级" : "作为下级分支";
    if (type === "comparison") return "作为并列比较维度";
    if (type === "cycle") return "作为循环中的一个阶段";
    if (type === "network") return "作为网络中的实体或枢纽";
    return index === 0 ? "作为流程或关系起点" : "承接上游并明确输出到下游";
}
