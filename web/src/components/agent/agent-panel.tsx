import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { Bot, PanelRightClose } from "lucide-react";
import { Button, Select, Tooltip } from "antd";
import { motion } from "motion/react";

import { CanvasLocalAgentPanel } from "@/components/canvas/canvas-local-agent-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { CANVAS_AGENT_PANEL_MOTION_MS, useAgentStore } from "@/stores/use-agent-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { AGENT_APPROVAL_MODE_OPTIONS, type AgentApprovalMode } from "@/lib/agent/agent-permissions";

const PANEL_MOTION_SECONDS = CANVAS_AGENT_PANEL_MOTION_MS / 1000;

export function AgentPanel() {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const width = useAgentStore((state) => state.width);
    const [resizing, setResizing] = useState(false);
    const panelMounted = useAgentStore((state) => state.panelMounted);
    const panelOpen = useAgentStore((state) => state.panelOpen);
    const panelClosing = useAgentStore((state) => state.panelClosing);
    const approvalMode = useAgentStore((state) => state.approvalMode);
    const agentId = useAgentStore((state) => state.agentId);
    const provider = useAgentStore((state) => state.provider);
    const providers = useAgentStore((state) => state.providers);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const setApprovalMode = useAgentStore((state) => state.setApprovalMode);
    const closePanel = useAgentStore((state) => state.closePanel);

    const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        let nextWidth = startWidth;
        const onMove = (moveEvent: PointerEvent) => {
            nextWidth = Math.min(760, Math.max(360, startWidth + startX - moveEvent.clientX));
            setAgentState({ width: nextWidth });
        };
        const onUp = () => {
            localStorage.setItem("canvas-agent-panel-width", String(nextWidth));
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            setResizing(false);
        };
        setResizing(true);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    if (!panelMounted) return null;
    const providerName = providers.find((item) => item.id === provider)?.displayName || (provider === "claude-code" ? "Claude Code" : "Codex");

    return (
        <motion.div
            className="fixed inset-y-0 right-0 z-[70] flex h-full shrink-0 sm:relative sm:inset-auto"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: panelOpen ? `min(100vw, ${width + 1}px)` : 0, opacity: panelOpen ? 1 : 0 }}
            transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "clip", pointerEvents: panelClosing ? "none" : undefined }}
        >
            <motion.aside
                id="global-agent-panel"
                className="relative flex h-full shrink-0 flex-col border-l"
                initial={{ x: 48 }}
                animate={{ x: panelClosing ? 28 : 0 }}
                transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                style={{ width: `min(100vw, ${width}px)`, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            >
                <button
                    type="button"
                    role="separator"
                    aria-orientation="vertical"
                    aria-valuemin={360}
                    aria-valuemax={760}
                    aria-valuenow={width}
                    className="absolute inset-y-0 left-0 z-40 hidden w-4 -translate-x-1/2 cursor-col-resize sm:block"
                    onPointerDown={startResize}
                    onKeyDown={(event) => {
                        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                        event.preventDefault();
                        const nextWidth = Math.min(760, Math.max(360, width + (event.key === "ArrowLeft" ? 20 : -20)));
                        setAgentState({ width: nextWidth });
                        localStorage.setItem("canvas-agent-panel-width", String(nextWidth));
                    }}
                    aria-label="调整右侧面板宽度"
                />
                <header className="flex h-14 shrink-0 items-center justify-between border-b px-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="grid size-8 place-items-center rounded-lg">
                            <Bot className="size-4" />
                        </span>
                        <div className="min-w-0">
                            <div className="text-base font-semibold leading-5">Agent</div>
                            <div className="truncate text-xs" style={{ color: theme.node.muted }}>
                                {providerName}
                            </div>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Tooltip title="网页侧审批独立于 MCP 客户端审批">
                            <Select
                                aria-label="Agent 操作审批模式"
                                size="small"
                                value={approvalMode}
                                className="w-40"
                                options={AGENT_APPROVAL_MODE_OPTIONS.map((item) => ({ ...item, disabled: item.value === "always-agent" && !agentId }))}
                                onChange={(value) => setApprovalMode(value as AgentApprovalMode)}
                            />
                        </Tooltip>
                        <Tooltip title="收起对话">
                            <Button aria-label="收起 Agent 面板" type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={{ color: theme.node.muted }} icon={<PanelRightClose className="size-4" />} onClick={closePanel} />
                        </Tooltip>
                    </div>
                </header>
                <CanvasLocalAgentPanel embedded />
            </motion.aside>
        </motion.div>
    );
}
