import type { RegistryOption } from "../types";
import { defineOption } from "./option-utils";

type OptionRow = readonly [id: string, nameZh: string, nameEn: string, description: string, promptFragment: string, keywords: readonly string[]];

function diagramOptions(group: string, rows: readonly OptionRow[]): RegistryOption[] {
    return rows.map(([id, nameZh, nameEn, description, promptFragment, keywords]) =>
        defineOption({
            id,
            nameZh,
            nameEn,
            description,
            useCases: [description],
            promptFragment,
            negativeFragment: "避免装饰线穿过节点、箭头方向含糊、标签过小、关系缺失或把技术代码绘制进画面。",
            keywords: [...keywords],
            reason: `关系结构适合${group}“${nameZh}”。`,
            compatibilityNotes: [`这是技术关系图${group}选项；最终由图片模型生成位图画面，平台硬约束优先。`],
        }),
    );
}

function wrapper(id: "auto" | "custom", scope: string, description: string): RegistryOption {
    return defineOption({
        id,
        nameZh: id === "auto" ? "自动推荐" : "自定义",
        nameEn: id === "auto" ? "Auto" : "Custom",
        description,
        useCases: [`需要${scope}${id === "auto" ? "按关系结构推荐" : "采用用户输入"}时`],
        promptFragment: id === "auto" ? `分析实体、顺序、层级和数据流后推荐${scope}。` : `采用用户填写的自定义${scope}语义，并保留清楚节点、连接和标签。`,
        negativeFragment: `不得把“${id}”绘制成画面文字；不得覆盖用户显式选择。`,
        keywords: [id, scope],
        reason: `这是 Luffy 的${scope}选择包装项，不是上游原生枚举值。`,
        compatibilityNotes: ["包装项用于 UI 和推荐状态；与上游规范 ID 分开保存。"],
    });
}

export const DIAGRAM_UPSTREAM_TYPES = diagramOptions("上游类型", [
    ["architecture", "架构图", "Architecture", "展示系统边界、组件、服务和部署关系。", "按层或域组织系统组件；用清楚边界、端口式连接和单向数据箭头表达关系。", ["架构", "系统", "组件"]],
    ["flowchart", "流程图", "Flowchart", "展示步骤、判断、分支和终点。", "使用明确起止、过程和判断节点；箭头方向连续，分支条件紧邻对应连线。", ["流程", "步骤", "判断"]],
    ["sequence", "时序图", "Sequence", "展示参与者之间按时间排序的交互。", "参与者横向排列，时间自上而下；消息箭头和返回关系按顺序对齐。", ["时序", "交互", "消息"]],
    ["structural", "结构关系图", "Structural", "展示对象、模块及其组成和依赖。", "按父子与依赖关系组织模块，边界和连接类型清楚区分。", ["结构", "模块", "依赖"]],
    ["mind-map", "思维导图", "Mind map", "从中心概念发散主题与子主题。", "中心主题突出，多级分支颜色和线重一致，兄弟节点等距且不交叉。", ["思维导图", "概念", "分支"]],
    ["timeline", "时间线", "Timeline", "按日期和阶段展示事件演进。", "使用连续时间轴，日期、事件和阶段标记逐项对齐，先后顺序不可改变。", ["时间", "历史", "阶段"]],
    ["illustrative", "说明示意图", "Illustrative", "用插画化对象解释机制或空间关系。", "以简化主体和标注引线解释机制，插画服务关系而不遮挡标签。", ["示意", "机制", "科普"]],
    ["state-machine", "状态机", "State machine", "展示状态、事件和状态转换。", "每个状态使用清楚节点，转换线标注触发事件，初始与终止状态明确。", ["状态", "转换", "事件"]],
    ["data-flow", "数据流图", "Data flow", "展示数据来源、处理、存储和去向。", "区分外部实体、处理节点和存储；数据箭头标注内容与方向。", ["数据流", "处理", "存储"]],
]);

export const DIAGRAM_EXTENSION_TYPES = diagramOptions("Luffy 扩展类型", [
    ["system-architecture", "系统架构", "System architecture", "面向产品或工程语境的系统级架构视图。", "沿客户端、服务、数据与外部依赖分层，继承 architecture 的组件边界和箭头语义。", ["系统架构", "服务", "部署"]],
    ["tech-stack", "技术栈", "Tech stack", "按层展示语言、框架、基础设施和工具。", "按前端、服务、数据、基础设施等层排列技术项，层内同级、层间依赖清楚。", ["技术栈", "框架", "工具"]],
    ["module-relations", "模块关系", "Module relations", "展示模块职责、依赖和调用方向。", "继承 structural 的模块边界，以不同线型区分依赖、调用与组合。", ["模块", "依赖", "调用"]],
    ["research-schematic", "科研示意", "Research schematic", "解释实验装置、研究机制或方法路线。", "继承 illustrative 的主体标注规则，准确呈现样品、装置、变量和步骤关系。", ["科研", "实验", "机制"]],
    ["hierarchy", "层级图", "Hierarchy", "展示组织、分类或权属关系。", "从根节点向下展开，父子关系使用一致连接线，同层节点对齐。", ["层级", "组织", "分类"]],
    ["causal", "因果图", "Causal", "展示原因、中介、结果和反馈。", "以单向箭头表达因果方向，区分直接、间接和反馈关系，避免仅凭空间暗示。", ["因果", "原因", "结果"]],
    ["cycle", "循环图", "Cycle", "展示迭代、生命周期和反馈闭环。", "节点围成闭环，箭头方向一致，明确输入、输出、反馈与重新开始位置。", ["循环", "迭代", "反馈"]],
    ["comparison", "比较关系图", "Comparison", "并列比较两个或多个系统、方案或状态。", "相同维度对齐，使用一致图标、尺度和标签，差异由色彩与注释共同表达。", ["比较", "方案", "差异"]],
    ["network", "网络关系图", "Network", "展示多对多实体、枢纽和连接强弱。", "以节点和边构成网络；枢纽用尺度表达，连接类型用颜色或线型配合图例。", ["网络", "节点", "连接"]],
]);

export const DIAGRAM_TYPES = [...DIAGRAM_UPSTREAM_TYPES, ...DIAGRAM_EXTENSION_TYPES];

export const DIAGRAM_TYPE_ALIASES: Readonly<Record<string, string>> = {
    "system-architecture": "architecture",
    "tech-stack": "architecture",
    "module-relations": "structural",
    "research-schematic": "illustrative",
    hierarchy: "structural",
    causal: "flowchart",
    cycle: "data-flow",
    comparison: "illustrative",
    network: "data-flow",
};

export const DIAGRAM_COLOR_ROLES = diagramOptions("语义色", [
    ["primary", "主节点青色", "Primary cyan", "用于主要实体、关键节点和主路径。", "主节点与关键路径使用 cyan 色系，在深色背景上保持清楚对比。", ["主节点", "关键路径", "cyan"]],
    ["secondary", "次级翡翠绿", "Secondary emerald", "用于成功、输出和次级功能域。", "成功、输出或次级功能域使用 emerald 色系，语义保持一致。", ["成功", "输出", "emerald"]],
    ["tertiary", "三级紫罗兰", "Tertiary violet", "用于第三类系统、辅助域和并列分组。", "第三类系统与辅助域使用 violet 色系，不与告警色混淆。", ["辅助", "分组", "violet"]],
    ["accent", "强调琥珀色", "Accent amber", "用于重点、里程碑和需关注信息。", "重点与里程碑使用 amber 色系，只在少量关键位置出现。", ["重点", "里程碑", "amber"]],
    ["alert", "告警玫红", "Alert rose", "用于错误、风险和阻断状态。", "错误、风险与阻断使用 rose 色系，并配合形状或标签避免只靠颜色传达。", ["错误", "风险", "rose"]],
    ["connector", "连接橙色", "Connector orange", "用于关键关系线和方向箭头。", "关键连接与方向箭头使用 orange 色系，线端和箭头方向清楚。", ["连接", "箭头", "orange"]],
    ["neutral", "中性石板灰", "Neutral slate", "用于背景层、次要边界和辅助文字。", "背景层、次要边界与辅助标签使用 slate 色系，降低视觉权重。", ["中性", "背景", "slate"]],
    ["highlight", "高亮蓝色", "Highlight blue", "用于当前焦点、选中路径和解释性高亮。", "当前焦点和需讲解路径使用 blue 高亮，并保持局部使用。", ["焦点", "高亮", "blue"]],
]);

export const DIAGRAM_RASTER_SEMANTIC_RULES = {
    background: "使用深石板色技术背景与极轻网格，或按平台风格做等价浅色转换；背景不得抢夺节点。",
    hierarchy: "标题、分组、节点、端口和注释形成稳定层级；同级对象保持相同尺寸与间距。",
    connectors: "所有关系线都有明确端点、方向和语义；线不得穿过节点，交叉处必须可辨。",
    labels: "标签简短、逐字准确、使用等宽或高可读字体气质；关键术语、数字和顺序不得改写。",
    output: "只生成最终位图关系图画面，不输出代码、标记语言或可交互界面。",
} as const;

export const DIAGRAM_TYPE_OPTIONS = [wrapper("auto", "关系图类型", "根据实体、顺序、层级和数据流推荐上游或 Luffy 扩展类型。"), ...DIAGRAM_TYPES, wrapper("custom", "关系图类型", "使用用户填写的自定义关系语义。")];
