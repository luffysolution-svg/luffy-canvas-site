const PENDING_IMAGE_PROMPT_KEY = "luffy-canvas:pending-image-prompt";
let consumedPrompt = "";

export function stageImagePrompt(prompt: string): boolean {
    if (typeof window === "undefined") return false;

    const value = typeof prompt === "string" ? prompt.trim() : "";
    if (!value) {
        consumedPrompt = "";
        try {
            window.sessionStorage.removeItem(PENDING_IMAGE_PROMPT_KEY);
        } catch {
            // An unavailable session store is equivalent to having nothing staged.
        }
        return false;
    }

    try {
        window.sessionStorage.setItem(PENDING_IMAGE_PROMPT_KEY, value);
        consumedPrompt = "";
        return true;
    } catch {
        return false;
    }
}

export function consumeImagePrompt(): string {
    if (typeof window === "undefined") return "";

    let value = "";
    try {
        value = window.sessionStorage.getItem(PENDING_IMAGE_PROMPT_KEY) || "";
    } catch {
        return "";
    }

    const prompt = value.trim();
    if (!prompt || prompt === consumedPrompt) return "";
    consumedPrompt = prompt;
    try {
        window.sessionStorage.removeItem(PENDING_IMAGE_PROMPT_KEY);
    } catch {
        // The in-memory marker still prevents a second consumption in this app session.
    }
    return prompt;
}
