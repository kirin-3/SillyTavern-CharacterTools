// src/ui/popup/handlers/iteration.ts
// Iteration history handlers

import { MODULE_NAME } from '../../../constants';
import { revertToIteration } from '../../../pipeline';
import { saveIterationHistory } from '../../../persistence';
import { renderIterationViewContent } from '../../components/iteration-history';
import { getState, getElement } from '../state';
import { updateAllComponents } from '../updaters';
import type { IterationSnapshot } from '../../../types';

export function initIterationHistoryListeners(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const container = el.querySelector(`#${MODULE_NAME}_iteration_history_container`);
    if (!container) return;

    container.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const s = getState();
        if (!s) return;

        // Revert button
        const revertBtn = target.closest(`.${MODULE_NAME}_iteration_revert_btn`);
        if (revertBtn) {
            const index = parseInt(revertBtn.getAttribute('data-index') || '-1', 10);
            if (index >= 0) {
                await handleRevertToIteration(index);
            }
        }

        // View button
        const viewBtn = target.closest(`.${MODULE_NAME}_iteration_view_btn`);
        if (viewBtn) {
            const index = parseInt(viewBtn.getAttribute('data-index') || '-1', 10);
            if (index >= 0 && index < s.pipeline.iterationHistory.length) {
                showIterationView(s.pipeline.iterationHistory[index]);
            }
        }
    });
}

async function handleRevertToIteration(index: number): Promise<void> {
    const state = getState();
    if (!state) return;

    const { Popup, POPUP_RESULT } = SillyTavern.getContext();

    const confirmed = await Popup.show.confirm(
        'Revert to Previous Iteration?',
        `This will restore the rewrite from iteration #${index + 1} and discard later changes.`,
    );

    if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;

    state.pipeline = revertToIteration(state.pipeline, index);
    state.activeStageView = 'rewrite';

    toastr.info(`Reverted to iteration #${index + 1}`);

    if (state.pipeline.character) {
        await saveIterationHistory(state.pipeline.character, state.pipeline.iterationHistory);
    }

    updateAllComponents();
}

async function showIterationView(snap: IterationSnapshot): Promise<void> {
    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const { DOMPurify } = SillyTavern.libs;

    const content = renderIterationViewContent(snap);

    const popup = new Popup(DOMPurify.sanitize(content), POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: 'Close',
        cancelButton: false,
    });

    await popup.show();
}
