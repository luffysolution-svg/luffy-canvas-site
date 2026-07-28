import type { StructuredPlan, StructuredPlanItem } from "../types";
import { SeriesPlanEditor } from "./series-plan-editor";

export function StoryboardEditor({
    plan,
    onChange,
    onRegeneratePanel,
    onRetryFailed,
    disabled,
}: {
    plan: StructuredPlan;
    onChange: (plan: StructuredPlan) => void;
    onRegeneratePanel?: (panel: StructuredPlanItem) => void;
    onRetryFailed?: () => void;
    disabled?: boolean;
}) {
    return <SeriesPlanEditor plan={plan} onChange={onChange} onRegenerateItem={onRegeneratePanel} onRetryFailed={onRetryFailed} disabled={disabled} />;
}
