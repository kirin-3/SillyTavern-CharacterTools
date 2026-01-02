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

// ============================================================================
// HELPERS
// ============================================================================

function formatApiDisplay(source: string, model: string): string {
    // Strip common provider prefixes to save space
    let displayModel = model
        .replace(/^anthropic\//, '')
        .replace(/^openai\//, '')
        .replace(/^google\//, '')
        .replace(/^meta-llama\//, 'llama-')
        .replace(/^mistralai\//, 'mistral-');

    // Truncate if still too long
    if (displayModel.length > 24) {
        displayModel = displayModel.substring(0, 21) + '...';
    }

    return `${source} • ${displayModel}`;
}

// ============================================================================
// UPDATE ORCHESTRATION
// ============================================================================

let isUpdating = false;

export function updateAllComponents(): void {
    if (isUpdating) {
        debugLog('info', 'updateAllComponents already running, skipping', null);
        return;
    }

    isUpdating = true;
    try {
        updateApiStatus();
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

// ============================================================================
// INDIVIDUAL UPDATERS
// ============================================================================

export function updateApiStatus(): void {
    const el = getElement();
    if (!el) return;

    const apiInfo = getApiInfo();
    const statusEl = el.querySelector(`#${MODULE_NAME}_api_status_display`);

    if (statusEl) {
        statusEl.className = `${MODULE_NAME}_api_status ${apiInfo.isReady ? 'connected' : 'disconnected'}`;
        const titleText = `${apiInfo.source} • ${apiInfo.model}\nContext: ${apiInfo.contextSize.toLocaleString()} • Max Output: ${apiInfo.maxOutput.toLocaleString()}`;
        statusEl.setAttribute('title', titleText);

        const textSpan = statusEl.querySelector(`.${MODULE_NAME}_api_status_text`);
        if (textSpan) {
            textSpan.textContent = formatApiDisplay(apiInfo.source, apiInfo.model);
        }

        const limitsSpan = statusEl.querySelector(`.${MODULE_NAME}_api_status_limits`);
        if (limitsSpan) {
            limitsSpan.textContent = `${apiInfo.maxOutput.toLocaleString()}t`;
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
        schemaContent,
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

    const isRewriteStage = state.activeStageView === 'rewrite';
    let colorClass = '';
    let warning = '';

    if (isRewriteStage) {
        // For rewrite: character content needs to fit in output
        // Estimate character tokens as ~65% of prompt (rest is system prompt + instructions)
        const estimatedCharTokens = Math.round(counts.promptTokens * 0.65);

        if (estimatedCharTokens > counts.maxOutput) {
            colorClass = 'danger';
            warning = ` ⚠️ Exceeds ${counts.maxOutput.toLocaleString()}t output limit`;
        } else if (estimatedCharTokens > counts.maxOutput * 0.8) {
            colorClass = 'warning';
            warning = ' ⚠️ Near output limit';
        }

        tokenEl.innerHTML = `<i class="fa-solid fa-microchip"></i> ~${estimatedCharTokens.toLocaleString()}t char → ${counts.maxOutput.toLocaleString()}t max${warning}`;
    } else {
        // For score/analyze: just show prompt size, less critical
        tokenEl.innerHTML = `<i class="fa-solid fa-microchip"></i> ${counts.promptTokens.toLocaleString()}t prompt`;
    }

    tokenEl.className = `${MODULE_NAME}_token_estimate ${colorClass}`;
}


export function updateSessionManager(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const container = el.querySelector(`#${MODULE_NAME}_session_container`);
    if (!container) return;

    // Hide if no character selected
    if (!state.pipeline.character) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    const existingManager = container.querySelector(`#${MODULE_NAME}_session_manager`);

    if (existingManager) {
        // Update existing
        updateSessionManagerState(
            container as HTMLElement,
            state.sessions,
            state.activeSessionId,
            state.hasUnsavedChanges,
            state.sessionListExpanded,
            !state.sessionsLoaded,
        );
    } else {
        // Initial render
        container.innerHTML = renderSessionManager(
            state.sessions,
            state.activeSessionId,
            state.hasUnsavedChanges,
            state.sessionListExpanded,
            !state.sessionsLoaded,
        );
    }
}
