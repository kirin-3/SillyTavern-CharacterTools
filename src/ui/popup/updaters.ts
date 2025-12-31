// src/ui/popup/updaters.ts
// All UI update functions - read state, update DOM, no side effects

import { MODULE_NAME, STAGE_LABELS, STAGE_ICONS } from '../../constants';
import { debugLog } from '../../debug';
import { getApiInfo, isApiReady, getStageTokenCount, getRefinementTokenCount } from '../../core/generator';
import { getNextStage } from '../../core/pipeline';
import { getSchemaPreset } from '../../core/settings';
import { getSchemaValidationFromCache, getState, getElement } from './state';
import { updateCharacterSelectState } from './components/character-select';
import { updatePipelineNavState } from './components/pipeline-nav';
import { updateStageConfigState } from './components/stage-config';
import { updateResultsPanelState } from './components/results-panel';
import { updateIterationHistoryState } from './components/iteration-history';
import { renderSessionManager, updateSessionManagerState } from './components/session-manager';

import type { StageConfig, SchemaValidationResult } from '../../types';

let isUpdating = false;

export function updateAllComponents(): void {
    if (isUpdating) {
        debugLog('info', 'updateAllComponents already running, skipping', null);
        return;
    }

    isUpdating = true;
    try {
        updateCharacterSelect();
        updateSessionManager();
        updatePipelineNav();
        updateStageSection();
        updateResultsPanel();
        updateTokenEstimate();
        updateIterationIndicator();
        updateIterationHistory();
    } finally {
        isUpdating = false;
    }
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
    if (!container) return;

    const config = state.pipeline.configs[state.activeStageView];

    // Resolve schema content once here, pass to component
    const schemaContent = resolveSchemaContent(config);

    // Get cached validation if structured output is enabled
    let schemaValidation: SchemaValidationResult | undefined = undefined;
    if (config.useStructuredOutput && schemaContent.trim()) {
        schemaValidation = getSchemaValidationFromCache(schemaContent) ?? undefined;
    }

    updateStageConfigState(
        container as HTMLElement,
        state.activeStageView,
        config,
        state.isGenerating || state.isRefining,
        !!state.pipeline.character,
        schemaValidation,
        schemaContent,  // Pass resolved content
    );
}

// Helper to resolve schema content from config
function resolveSchemaContent(config: StageConfig): string {
    if (config.schemaPresetId) {
        const preset = getSchemaPreset(config.schemaPresetId);
        if (preset) return JSON.stringify(preset.schema, null, 2);
    }
    return config.customSchema;
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

export function updateSessionManager(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const container = el.querySelector(`#${MODULE_NAME}_session_section`);
    if (!container) return;

    if (!state.pipeline.character) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    const managerContainer = container.querySelector(`#${MODULE_NAME}_session_manager_container`);
    if (managerContainer) {
        if (!state.sessionsLoaded) {
            managerContainer.innerHTML = `
                <div class="${MODULE_NAME}_session_loading">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <span>Loading sessions...</span>
                </div>
            `;
        } else {
            const existingManager = managerContainer.querySelector(`#${MODULE_NAME}_session_manager`);
            if (existingManager) {
                updateSessionManagerState(
                    managerContainer as HTMLElement,
                    state.sessions,
                    state.activeSessionId,
                    state.hasUnsavedChanges,
                );
            } else {
                managerContainer.innerHTML = renderSessionManager(
                    state.sessions,
                    state.activeSessionId,
                    state.hasUnsavedChanges,
                );
            }
        }
    }
}
