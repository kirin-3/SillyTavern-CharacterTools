// src/ui/popup/handlers/iteration.ts
// Iteration history interaction handlers

import { MODULE_NAME } from '../../../constants';
import { debugLog } from '../../../debug';
import { revertToIteration } from '../../../pipeline';  // FIXED: was restoreFromIteration
import { getState, getElement, markUnsavedChanges } from '../state';
import { updateAllComponents } from '../updaters';
import { scheduleAutoSave } from './session';

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initIterationHistoryListeners(): void {
    const el = getElement();
    if (!el) return;

    const container = el.querySelector(`#${MODULE_NAME}_iteration_history_container`);
    if (!container) return;

    container.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;

        // Revert button (was restore)
        const revertBtn = target.closest(`.${MODULE_NAME}_iteration_revert_btn`);
        if (revertBtn) {
            const index = parseInt(revertBtn.getAttribute('data-index') || '-1', 10);
            if (index >= 0) {
                await handleRevertIteration(index);
            }
            return;
        }

        // View button
        const viewBtn = target.closest(`.${MODULE_NAME}_iteration_view_btn`);
        if (viewBtn) {
            const index = parseInt(viewBtn.getAttribute('data-index') || '-1', 10);
            if (index >= 0) {
                await handleViewIteration(index);
            }
            return;
        }
    });
}

// ============================================================================
// HANDLERS
// ============================================================================

export async function handleRevertIteration(iterationIndex: number): Promise<void> {
    const state = getState();
    if (!state) return;

    const { Popup, POPUP_RESULT } = SillyTavern.getContext();

    const iteration = state.pipeline.iterationHistory[iterationIndex];
    if (!iteration) {
        toastr.error('Iteration not found');
        return;
    }

    const confirmed = await Popup.show.confirm(
        'Revert to Iteration?',
        `Revert to iteration ${iterationIndex + 1}? Current results will be replaced.`,
    );

    if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;

    state.pipeline = revertToIteration(state.pipeline, iterationIndex);
    markUnsavedChanges();
    scheduleAutoSave();

    updateAllComponents();
    toastr.success(`Reverted to iteration ${iterationIndex + 1}`);

    debugLog('info', 'Reverted iteration', { index: iterationIndex });
}

async function handleViewIteration(iterationIndex: number): Promise<void> {
    const state = getState();
    if (!state) return;

    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const { DOMPurify, moment } = SillyTavern.libs;

    const iteration = state.pipeline.iterationHistory[iterationIndex];
    if (!iteration) {
        toastr.error('Iteration not found');
        return;
    }

    const verdictClass = `character_tools_verdict_${iteration.verdict}`;
    const verdictLabel = iteration.verdict === 'accept' ? 'Accepted'
        : iteration.verdict === 'needs_refinement' ? 'Needs Work'
            : 'Regression';

    const content = `
        <div class="character_tools_iteration_view">
            <div class="character_tools_iteration_view_header">
                <h3>Iteration #${iteration.iteration + 1}</h3>
                <span class="character_tools_verdict_badge ${verdictClass}">
                    ${verdictLabel}
                </span>
                <span>${moment(iteration.timestamp).format('YYYY-MM-DD HH:mm:ss')}</span>
            </div>
            <div class="character_tools_iteration_view_section">
                <h4>Rewrite</h4>
                <div class="character_tools_iteration_view_content">${DOMPurify.sanitize(iteration.rewriteResponse, { ALLOWED_TAGS: [] })}</div>
            </div>
            <div class="character_tools_iteration_view_section">
                <h4>Analysis</h4>
                <div class="character_tools_iteration_view_content">${DOMPurify.sanitize(iteration.analysisResponse, { ALLOWED_TAGS: [] })}</div>
            </div>
        </div>
    `;

    await new Popup(DOMPurify.sanitize(content), POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: 'Close',
        cancelButton: false,
    }).show();
}
