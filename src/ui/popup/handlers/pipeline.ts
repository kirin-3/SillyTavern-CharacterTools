// src/ui/popup/handlers/pipeline.ts
// Pipeline navigation handlers

import { MODULE_NAME } from '../../../constants';
import { toggleStage, resetPipeline } from '../../../pipeline';
import { getState, getElement } from '../state';
import { updatePipelineNav, updateResultsPanel, updateStageSection, updateTokenEstimate, updateAllComponents } from '../updaters';
import { runSingleStage, runAllStages } from '../generation';
import type { StageName } from '../../../types';

export function initPipelineNavListeners(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const container = el.querySelector(`#${MODULE_NAME}_pipeline_nav_container`);
    if (!container) return;

    container.addEventListener('change', (e) => {
        const checkbox = e.target as HTMLInputElement;
        const s = getState();
        if (checkbox.classList.contains(`${MODULE_NAME}_stage_checkbox`) && s) {
            const stage = checkbox.getAttribute('data-stage') as StageName;
            if (stage) {
                s.pipeline = toggleStage(s.pipeline, stage);
                updatePipelineNav();
                updateResultsPanel();
            }
        }
    });

    container.addEventListener('click', async (e) => {
        const s = getState();
        if (!s) return;

        const btn = (e.target as HTMLElement).closest(`.${MODULE_NAME}_stage_btn`);
        if (btn) {
            const stage = btn.getAttribute('data-stage') as StageName;
            if (stage) {
                s.activeStageView = stage;
                updateStageSection();
                updateResultsPanel();
                updateTokenEstimate();
                updatePipelineNav();
            }
        }

        const runBtn = (e.target as HTMLElement).closest(`#${MODULE_NAME}_run_selected_btn`);
        if (runBtn) {
            runSingleStage(s.activeStageView);
        }

        const runAllBtn = (e.target as HTMLElement).closest(`#${MODULE_NAME}_run_all_btn`);
        if (runAllBtn) {
            runAllStages();
        }

        const resetBtn = (e.target as HTMLElement).closest(`#${MODULE_NAME}_reset_pipeline_btn`);
        if (resetBtn) {
            const { Popup, POPUP_RESULT } = SillyTavern.getContext();

            const hasContent = s.pipeline.results.score ||
                s.pipeline.results.rewrite ||
                s.pipeline.iterationHistory.length > 0;

            if (hasContent) {
                const confirmed = await Popup.show.confirm(
                    'Reset Current Session?',
                    'This will clear all results and start fresh. Your session will be saved first. Continue?',
                );

                if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;

                // Save current state before reset
                if (s.pipeline.character && s.hasUnsavedChanges) {
                    const { saveSession } = await import('../../../persistence');
                    await saveSession(s.pipeline.character, s.pipeline, s.activeSessionId || undefined);
                }
            }

            // Reset pipeline but keep character
            const character = s.pipeline.character;
            const charIndex = s.pipeline.characterIndex;

            s.pipeline = resetPipeline(s.pipeline, true);
            s.pipeline.characterIndex = charIndex;  // Restore the index
            s.hasUnsavedChanges = false;

            // Start a new session
            if (character) {
                const { saveSession, loadCharacterSessions } = await import('../../../persistence');
                const sessionId = await saveSession(character, s.pipeline, undefined, `Session ${s.sessions.length + 1}`);
                s.activeSessionId = sessionId;

                const data = await loadCharacterSessions(character);
                s.sessions = data.sessions;
            }

            updateAllComponents();
            toastr.info('Session reset');
        }
    });
}
