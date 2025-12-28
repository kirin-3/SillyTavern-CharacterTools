// src/ui/popup/index.ts
// Main entry point - orchestrates all components

import { MODULE_NAME, STAGES } from '../../constants';
import { debugLog, logError } from '../../debug';
import { getPromptPreset, getSchemaPreset } from '../../settings';
import { updateStageConfig as pipelineUpdateStageConfig } from '../../pipeline';
import { clearIterationHistory } from '../../persistence';
import { renderCharacterSelect } from '../components/character-select';
import { renderPipelineNav } from '../components/pipeline-nav';
import { renderStageConfig, clearSchemaValidationCache } from '../components/stage-config';
import { renderResultsPanel } from '../components/results-panel';
import { renderIterationHistory } from '../components/iteration-history';
import { openSettingsModal } from '../settings-modal';

import { getState, getElement, setState, setElement, createInitialState } from './state';
import { subscribeEvents, initGlobalListeners, cleanup } from './lifecycle';
import { buildPopupContent } from './html';
import { updateAllComponents } from './updaters';
import { runSingleStage } from './generation';
import { initCharacterSelectListeners, resetCharacterSelectInit } from './handlers/character';
import { initPipelineNavListeners } from './handlers/pipeline';
import { initStageConfigListeners } from './handlers/stage-config';
import { initResultsPanelListeners } from './handlers/results';
import { initIterationHistoryListeners } from './handlers/iteration';

import type { Character } from '../../types';

export async function openMainPopup(): Promise<void> {
    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const { DOMPurify } = SillyTavern.libs;

    resetCharacterSelectInit();
    clearSchemaValidationCache();
    setState(createInitialState());

    let content: string;
    try {
        content = buildPopupContent();
    } catch (e) {
        logError('Failed to build popup content', e);
        toastr.error('Failed to open Character Tools. Check console for details.');
        setState(null);
        return;
    }

    const popup = new Popup(DOMPurify.sanitize(content), POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: false,
        cancelButton: false,
    });

    popup.show().then(async () => {
        const state = getState();
        if (state?.abortController) {
            state.abortController.abort();
        }

        if (state?.pipeline.character) {
            await clearIterationHistory(state.pipeline.character);
            debugLog('info', 'Iteration history cleared on popup close', {
                character: state.pipeline.character.name,
            });
        }

        cleanup();
        clearSchemaValidationCache();
        resetCharacterSelectInit();

        debugLog('info', 'Popup closed', null);
    });

    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const popupEl = document.getElementById(`${MODULE_NAME}_popup`);
    setElement(popupEl);

    if (!popupEl) {
        logError('Popup element not found after creation', null);
        toastr.error('Failed to initialize Character Tools popup.');
        setState(null);
        return;
    }

    try {
        subscribeEvents();
        initGlobalListeners(runSingleStage);

        const { characters } = SillyTavern.getContext();
        const charList = characters as Character[];

        initComponents(charList);
        updateAllComponents();

        debugLog('info', 'Popup opened', { characterCount: charList.length });
    } catch (e) {
        logError('Failed to initialize popup components', e);
        toastr.error('Character Tools opened but some features may not work.');
    }
}

function initComponents(characters: Character[]): void {
    const state = getState();
    const el = getElement();
    if (!state || !el) return;

    // Character select
    const charContainer = el.querySelector(`#${MODULE_NAME}_character_select_container`);
    if (charContainer) {
        charContainer.innerHTML = renderCharacterSelect(
            characters,
            state.pipeline.characterIndex,
            state.pipeline.selectedFields,
        );
        initCharacterSelectListeners();
    }

    // Pipeline nav
    const pipelineContainer = el.querySelector(`#${MODULE_NAME}_pipeline_nav_container`);
    if (pipelineContainer) {
        pipelineContainer.innerHTML = renderPipelineNav(
            state.pipeline.selectedStages,
            state.pipeline.stageStatus,
            state.activeStageView,
            !!state.pipeline.character,
        );
        initPipelineNavListeners();
    }

    // Stage config
    const stageContainer = el.querySelector(`#${MODULE_NAME}_stage_config_container`);
    if (stageContainer) {
        stageContainer.innerHTML = renderStageConfig(
            state.activeStageView,
            state.pipeline.configs[state.activeStageView],
            null,
            !!state.pipeline.character,
        );
        initStageConfigListeners();
    }

    // Results panel
    const resultsContainer = el.querySelector(`#${MODULE_NAME}_results_container`);
    if (resultsContainer) {
        resultsContainer.innerHTML = renderResultsPanel(
            state.activeStageView,
            state.pipeline.results[state.activeStageView],
            state.pipeline.stageStatus[state.activeStageView],
            state.isGenerating,
        );
        initResultsPanelListeners();
    }

    // Iteration history
    const historyContainer = el.querySelector(`#${MODULE_NAME}_iteration_history_container`);
    if (historyContainer) {
        historyContainer.innerHTML = renderIterationHistory(
            state.pipeline.iterationHistory,
            state.pipeline.iterationCount,
            state.historyLoaded,
        );
        initIterationHistoryListeners();
    }

    // Header buttons
    el.querySelector(`#${MODULE_NAME}_settings_btn`)?.addEventListener('click', () => {
        openSettingsModal(() => {
            const s = getState();
            if (s) {
                checkForDeletedPresetReferences();
            }
            updateAllComponents();
        });
    });

    el.querySelector(`#${MODULE_NAME}_close_btn`)?.addEventListener('click', () => {
        const dialog = el.closest('.popup');
        if (dialog) {
            const cancelBtn = dialog.querySelector('.popup-button-cancel, .popup-button-ok') as HTMLElement;
            cancelBtn?.click();
        }
    });
}

function checkForDeletedPresetReferences(): void {
    const state = getState();
    if (!state) return;

    for (const stage of STAGES) {
        const config = state.pipeline.configs[stage];

        if (config.promptPresetId && !getPromptPreset(config.promptPresetId)) {
            debugLog('info', 'Clearing deleted prompt preset reference', { stage, presetId: config.promptPresetId });
            state.pipeline = pipelineUpdateStageConfig(state.pipeline, stage, {
                promptPresetId: null,
            });
        }

        if (config.schemaPresetId && !getSchemaPreset(config.schemaPresetId)) {
            debugLog('info', 'Clearing deleted schema preset reference', { stage, presetId: config.schemaPresetId });
            state.pipeline = pipelineUpdateStageConfig(state.pipeline, stage, {
                schemaPresetId: null,
            });
        }
    }
}
