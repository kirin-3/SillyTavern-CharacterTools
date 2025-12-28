// src/ui/popup/handlers/results.ts
// Results panel handlers

import { MODULE_NAME } from '../../../constants';
import {
    lockStageResult,
    unlockStageResult,
    clearStageResult,
    getNextStage,
    acceptRewrite,
    generateExportData,
} from '../../../pipeline';
import { getState, getElement } from '../state';
import { updateResultsPanel, updateStageSection, updateTokenEstimate, updatePipelineNav, updateAllComponents } from '../updaters';
import { runSingleStage, runRefinement } from '../generation';

export function initResultsPanelListeners(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const container = el.querySelector(`#${MODULE_NAME}_results_container`);
    if (!container) return;

    container.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const s = getState();
        if (!s) return;

        // Regenerate
        if (target.closest(`#${MODULE_NAME}_regenerate_btn`)) {
            s.pipeline = clearStageResult(s.pipeline, s.activeStageView);
            runSingleStage(s.activeStageView);
        }

        // Lock/Unlock
        if (target.closest(`#${MODULE_NAME}_lock_btn`)) {
            s.pipeline = lockStageResult(s.pipeline, s.activeStageView);
            updateResultsPanel();
        }

        if (target.closest(`#${MODULE_NAME}_unlock_btn`)) {
            s.pipeline = unlockStageResult(s.pipeline, s.activeStageView);
            updateResultsPanel();
        }

        // Continue to next stage
        if (target.closest(`#${MODULE_NAME}_continue_btn`)) {
            const nextStage = getNextStage(s.pipeline, s.activeStageView);
            if (nextStage) {
                s.activeStageView = nextStage;
                updateStageSection();
                updateResultsPanel();
                updateTokenEstimate();
                updatePipelineNav();
            }
        }

        // Run analyze after refinement
        if (target.closest(`#${MODULE_NAME}_run_analyze_btn`)) {
            s.activeStageView = 'analyze';
            updateStageSection();
            updateResultsPanel();
            updatePipelineNav();
            runSingleStage('analyze');
        }

        // Refine
        if (target.closest(`#${MODULE_NAME}_refine_btn`)) {
            runRefinement();
        }

        // Accept rewrite
        if (target.closest(`#${MODULE_NAME}_accept_btn`)) {
            s.pipeline = acceptRewrite(s.pipeline);
            toastr.success('Rewrite accepted as final');
            updateAllComponents();
        }

        // Copy
        if (target.closest(`#${MODULE_NAME}_copy_btn`)) {
            const result = s.pipeline.results[s.activeStageView];
            if (result) {
                await navigator.clipboard.writeText(result.response);
                toastr.success('Copied to clipboard');
            }
        }

        // Export
        if (target.closest(`#${MODULE_NAME}_export_btn`)) {
            exportSession();
        }

        // Cancel generation
        if (target.closest(`#${MODULE_NAME}_cancel_btn`) && s.abortController) {
            s.abortController.abort();
        }
    });
}

function exportSession(): void {
    const state = getState();
    if (!state?.pipeline.character) return;

    const { moment } = SillyTavern.libs;
    const pipeline = state.pipeline;
    const character = pipeline.character;

    const content = generateExportData(pipeline);
    if (!content) {
        toastr.error('Nothing to export');
        return;
    }

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${character?.name.replace(/[^a-z0-9]/gi, '_') || 'character'}_session_${moment().format('YYYYMMDD_HHmmss')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toastr.success('Session exported');
}
