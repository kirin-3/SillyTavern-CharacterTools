// src/ui/popup/updaters.ts
// All UI update functions

import { MODULE_NAME, STAGE_LABELS, STAGE_ICONS } from '../../constants';
import { getApiInfo, isApiReady, getStageTokenCount, getRefinementTokenCount } from '../../generator';
import { getNextStage } from '../../pipeline';
import { updateCharacterSelectState } from '../components/character-select';
import { updatePipelineNavState } from '../components/pipeline-nav';
import { updateStageConfigState } from '../components/stage-config';
import { updateResultsPanelState } from '../components/results-panel';
import { updateIterationHistoryState } from '../components/iteration-history';
import { getState, getElement } from './state';

export function updateAllComponents(): void {
    updateCharacterSelect();
    updatePipelineNav();
    updateStageSection();
    updateResultsPanel();
    updateTokenEstimate();
    updateIterationIndicator();
    updateIterationHistory();
}

export function updateApiStatus(): void {
    const el = getElement();
    if (!el) return;

    const apiInfo = getApiInfo();
    const statusEl = el.querySelector(`.${MODULE_NAME}_api_status`);

    if (statusEl) {
        statusEl.className = `${MODULE_NAME}_api_status ${apiInfo.isReady ? 'connected' : 'disconnected'}`;
        const textSpan = statusEl.querySelector('span');
        if (textSpan) {
            textSpan.textContent = apiInfo.source;
        }
    }

    updatePipelineNav();
}

export function updateCharacterSelect(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const container = el.querySelector(`#${MODULE_NAME}_character_select_container`);
    if (container) {
        updateCharacterSelectState(
      container as HTMLElement,
      state.pipeline.character,
      state.pipeline.characterIndex,
      state.pipeline.selectedFields,
        );
    }
}

export function updatePipelineNav(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const container = el.querySelector(`#${MODULE_NAME}_pipeline_nav_container`);
    if (container) {
        updatePipelineNavState(
      container as HTMLElement,
      state.pipeline.selectedStages,
      state.pipeline.stageStatus,
      state.activeStageView,
      !!state.pipeline.character && isApiReady(),
      state.isGenerating || state.isRefining,
        );
    }
}

export function updateStageSection(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const icon = el.querySelector(`#${MODULE_NAME}_stage_icon`);
    const title = el.querySelector(`#${MODULE_NAME}_stage_title`);

    if (icon) {
        icon.className = `fa-solid ${STAGE_ICONS[state.activeStageView]}`;
    }
    if (title) {
        title.textContent = STAGE_LABELS[state.activeStageView];
    }

    updateStageConfigUI();
}

export function updateStageConfigUI(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const container = el.querySelector(`#${MODULE_NAME}_stage_config_container`);
    if (container) {
        updateStageConfigState(
      container as HTMLElement,
      state.activeStageView,
      state.pipeline.configs[state.activeStageView],
      state.isGenerating || state.isRefining,
      !!state.pipeline.character,
        );
    }
}

export function updateResultsPanel(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const container = el.querySelector(`#${MODULE_NAME}_results_container`);
    if (container) {
        updateResultsPanelState(
      container as HTMLElement,
      state.activeStageView,
      state.pipeline.results[state.activeStageView],
      state.pipeline.stageStatus[state.activeStageView],
      state.isGenerating,
      getNextStage(state.pipeline, state.activeStageView),
      state.pipeline,
        );
    }
}

export function updateIterationIndicator(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const indicator = el.querySelector(`#${MODULE_NAME}_iteration_indicator`);
    if (!indicator) return;

    if (state.pipeline.iterationCount > 0 || state.pipeline.isRefining) {
        indicator.classList.remove('hidden');
        indicator.innerHTML = `
      <i class="fa-solid fa-arrows-rotate"></i>
      Iteration #${state.pipeline.iterationCount + 1}
    `;
    } else {
        indicator.classList.add('hidden');
    }
}

export function updateIterationHistory(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const container = el.querySelector(`#${MODULE_NAME}_iteration_history_container`);
    if (container) {
        updateIterationHistoryState(
      container as HTMLElement,
      state.pipeline.iterationHistory,
      state.pipeline.iterationCount,
      state.historyLoaded,
        );
    }
}

export async function updateTokenEstimate(): Promise<void> {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const tokenEl = el.querySelector(`#${MODULE_NAME}_token_estimate`);
    if (!tokenEl) return;

    if (!state.pipeline.character) {
        tokenEl.innerHTML = '<i class="fa-solid fa-microchip"></i> Select a character';
        tokenEl.className = `${MODULE_NAME}_token_estimate`;
        return;
    }

    tokenEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    tokenEl.className = `${MODULE_NAME}_token_estimate`;

    let counts;
    if (state.pipeline.isRefining && state.pipeline.results.rewrite && state.pipeline.results.analyze) {
        counts = await getRefinementTokenCount(state.pipeline);
    } else {
        counts = await getStageTokenCount(state.pipeline, state.activeStageView);
    }

    // Re-check state after async
    if (!getState() || !getElement()) return;

    if (!counts) {
        tokenEl.innerHTML = '<i class="fa-solid fa-microchip"></i> --';
        tokenEl.className = `${MODULE_NAME}_token_estimate`;
        return;
    }

    let colorClass = '';
    if (counts.percentage > 100) colorClass = 'danger';
    else if (counts.percentage > 80) colorClass = 'warning';

    tokenEl.innerHTML = `<i class="fa-solid fa-microchip"></i> ${counts.promptTokens.toLocaleString()}t (${counts.percentage}%)`;
    tokenEl.className = `${MODULE_NAME}_token_estimate ${colorClass}`;
}
