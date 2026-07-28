import { Select } from "antd";
import { Layers3 } from "lucide-react";

import { DESIGN_SKILLS } from "../registry/design-skills";
import type { DesignSkillId } from "../types";

export function DesignSkillSelect({ value, onChange, disabled }: { value: DesignSkillId; onChange: (value: DesignSkillId) => void; disabled?: boolean }) {
    return (
        <label className="block min-w-0">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <Layers3 className="size-3.5" />
                设计 Skill
            </span>
            <Select
                value={value}
                disabled={disabled}
                className="w-full"
                popupMatchSelectWidth={false}
                styles={{
                    popup: {
                        root: {
                            width: "min(360px, calc(100vw - 48px))",
                            maxWidth: "calc(100vw - 48px)",
                        },
                    },
                }}
                aria-label="设计 Skill"
                options={DESIGN_SKILLS.map((skill) => ({ value: skill.id, label: skill.label, description: skill.description }))}
                optionRender={(option) => (
                    <div className="py-1">
                        <div className="font-medium">{option.label}</div>
                        <div className="mt-0.5 whitespace-normal text-xs text-stone-500 dark:text-stone-400">{option.data.description}</div>
                    </div>
                )}
                onChange={onChange}
            />
        </label>
    );
}
