import { useEffect } from "react";
import { App } from "antd";

const PENDING_IMAGE_PROMPT_KEY = "luffy-canvas:pending-image-prompt";

export function PromptOptimizerTransferBridge() {
    const { message } = App.useApp();

    useEffect(() => {
        if (window.location.pathname !== "/image") return;

        let pending = "";
        try {
            pending = sessionStorage.getItem(PENDING_IMAGE_PROMPT_KEY) || "";
        } catch {
            return;
        }
        if (!pending) return;

        const applyPendingPrompt = () => {
            const input = findImagePromptTextarea();
            if (!input) return false;
            setNativeTextAreaValue(input, pending);
            input.focus();
            try {
                sessionStorage.removeItem(PENDING_IMAGE_PROMPT_KEY);
            } catch {
                // The prompt was already applied; storage cleanup is best effort.
            }
            message.success("已将优化后的提示词带入生图工作台");
            return true;
        };

        if (applyPendingPrompt()) return;
        const observer = new MutationObserver(() => {
            if (!applyPendingPrompt()) return;
            observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const timeout = window.setTimeout(() => observer.disconnect(), 10_000);
        return () => {
            observer.disconnect();
            window.clearTimeout(timeout);
        };
    }, [message]);

    return null;
}

function findImagePromptTextarea() {
    const headings = Array.from(document.querySelectorAll("span")).filter((element) => element.textContent?.trim() === "提示词");
    for (const heading of headings) {
        const container = heading.parentElement?.parentElement;
        const input = container?.querySelector("textarea");
        if (input instanceof HTMLTextAreaElement) return input;
    }
    const textareas = Array.from(document.querySelectorAll("textarea"));
    return textareas.find((input) => input.placeholder?.includes("描述画面主体")) || null;
}

function setNativeTextAreaValue(input: HTMLTextAreaElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
}
