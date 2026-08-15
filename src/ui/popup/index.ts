// src/ui/popup/index.ts
// Main entry point - orchestrates all components with unified event binding

import { MODULE_NAME, STAGES } from '../../constants';
import { debugLog, logError } from '../../debug';
import { getPromptPreset, getSchemaPreset } from '../../core/settings';
import { updateStageConfig as pipelineUpdateStageConfig } from '../../core/pipeline';
import { getState, getElement, setState, setElement, createInitialState, addCleanupFunction, resetAllCaches } from './state';
import { buildPopupContent, toggleConfigRail } from './html';
import { updateAllComponents } from './updaters';
import { subscribeEvents, initGlobalListeners, cleanup } from './lifecycle';
import * as actions from './actions';

// Components for initial render
import { renderCharacterSelect } from './components/character-select';
import { renderPipelineNav } from './components/pipeline-nav';
import { renderStageConfig, setConfigDisclosure } from './components/stage-config';
import { renderResultsPanel } from './components/results-panel';
import { renderIterationHistory } from './components/iteration-history';
import { renderSessionManager } from './components/session-manager';
import { openSettingsModal } from '../settings-modal';
import type { Character, StageName } from '../../types';

// ============================================================================
// DEBOUNCE TRACKING
// ============================================================================

interface DebouncedFunc {
    (...args: unknown[]): unknown;
    cancel(): void;
}

const debouncedFunctions: DebouncedFunc[] = [];

function trackDebouncedFunction(fn: DebouncedFunc): void {
    debouncedFunctions.push(fn);
}

function cancelAllDebouncedFunctions(): void {
    debouncedFunctions.forEach(fn => fn.cancel());
    debouncedFunctions.length = 0;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function openMainPopup(): Promise<void> {
    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const { DOMPurify } = SillyTavern.libs;

    // Reset caches and create fresh state
    resetAllCaches();
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
        // Cleanup on close
        actions.cancelGeneration();
        await actions.forceSave();
        actions.cancelAutoSave();
        cancelAllDebouncedFunctions();
        cleanup();
        debugLog('info', 'Popup closed', null);
    });

    // Wait for DOM
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
        const { characters } = SillyTavern.getContext();
        const charList = characters as Character[];

        // Initialize components (render only, no event binding)
        initComponents(charList);

        // Bind all events with delegation
        initEventBindings(popupEl);

        // Subscribe to ST events and keyboard
        subscribeEvents();
        initGlobalListeners();

        // Initial UI update
        updateAllComponents();

        debugLog('info', 'Popup opened', { characterCount: charList.length });
    } catch (e) {
        logError('Failed to initialize popup components', e);
        toastr.error('Character Tools opened but some features may not work.');
    }
}

// ============================================================================
// COMPONENT INITIALIZATION (RENDER ONLY)
// ============================================================================

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
    }

    // Session manager
    const sessionContainer = el.querySelector(`#${MODULE_NAME}_session_container`);
    if (sessionContainer) {
        sessionContainer.innerHTML = renderSessionManager(
            state.sessions,
            state.activeSessionId,
            state.hasUnsavedChanges,
            state.sessionListExpanded,
            !state.sessionsLoaded,
        );
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
    }

    // Results panel
    const resultsContainer = el.querySelector(`#${MODULE_NAME}_results_container`);
    if (resultsContainer) {
        resultsContainer.innerHTML = renderResultsPanel(
            state.activeStageView,
            state.pipeline.results[state.activeStageView],
            state.pipeline.stageStatus[state.activeStageView],
            state.isGenerating,
            state.pipeline,
        );
    }

    // Iteration history
    const historyContainer = el.querySelector(`#${MODULE_NAME}_iteration_history_container`);
    if (historyContainer) {
        historyContainer.innerHTML = renderIterationHistory(
            state.pipeline.iterationHistory,
            state.pipeline.iterationCount,
            state.historyLoaded,
        );
    }
}

// ============================================================================
// UNIFIED EVENT BINDING
// ============================================================================

function initEventBindings(container: HTMLElement): void {
    initCharacterSectionEvents(container);
    initSessionSectionEvents(container);
    initPipelineSectionEvents(container);
    initStageConfigEvents(container);
    initResultsEvents(container);
    initIterationHistoryEvents(container);
    initHeaderEvents(container);
    initDocumentEvents(container);
}

// ============================================================================
// CHARACTER SECTION EVENTS
// ============================================================================

function initCharacterSectionEvents(container: HTMLElement): void {
    const { lodash } = SillyTavern.libs;

    const charSection = container.querySelector(`#${MODULE_NAME}_character_select_container`);
    if (!charSection) return;

    charSection.addEventListener('toggle', (e) => {
        const target = e.target as HTMLDetailsElement;
        if (target.matches('[data-field-selection-disclosure]')) {
            setConfigDisclosure('fields', target.open);
        }
    }, true);

    const searchInput = charSection.querySelector(`#${MODULE_NAME}_char_search`) as HTMLInputElement;
    const dropdown = charSection.querySelector(`#${MODULE_NAME}_char_dropdown`) as HTMLElement;

    // Search input - debounced
    if (searchInput) {
        const debouncedSearch = lodash.debounce((query: string) => {
            actions.updateSearchQuery(query);
        }, 150);
        trackDebouncedFunction(debouncedSearch);

        searchInput.addEventListener('input', () => {
            debouncedSearch(searchInput.value);
        });

        // Keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            const state = getState();
            if (!state) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                actions.navigateSearchResults('down');
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                actions.navigateSearchResults('up');
            } else if (e.key === 'Enter' && state.searchState.selectedIndex >= 0) {
                e.preventDefault();
                const selected = state.searchState.results[state.searchState.selectedIndex];
                if (selected) {
                    actions.selectSearchResult(selected.index);  // Pass character index
                }
            } else if (e.key === 'Escape') {
                actions.closeSearchDropdown();
            }
        });
    }

    // Dropdown click - delegation
    if (dropdown) {
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = (e.target as HTMLElement).closest(`.${MODULE_NAME}_dropdown_item`);
            if (item) {
                const index = parseInt(item.getAttribute('data-index') || '-1', 10);
                if (index >= 0) {
                    actions.selectSearchResult(index);
                }
            }
        });
    }

    // Character section click delegation
    charSection.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        // Clear character button
        if (target.closest(`#${MODULE_NAME}_char_clear`)) {
            actions.clearCharacter();
            return;
        }

        // Select all fields
        if (target.closest(`#${MODULE_NAME}_select_all_fields`)) {
            actions.selectAllFields();
            return;
        }

        // Deselect all fields
        if (target.closest(`#${MODULE_NAME}_select_none_fields`)) {
            actions.deselectAllFields();
            return;
        }

        // Field expand button
        const expandBtn = target.closest(`.${MODULE_NAME}_field_expand_btn`);
        if (expandBtn) {
            e.preventDefault();
            e.stopPropagation();
            const fieldKey = expandBtn.getAttribute('data-field');
            if (fieldKey) {
                actions.expandField(fieldKey);
            }
            return;
        }
        const altGreetingExpandBtn = target.closest(`.${MODULE_NAME}_alt_greeting_expand_btn`);
        if (altGreetingExpandBtn) {
            e.preventDefault();
            e.stopPropagation();
            const greetingIndex = parseInt(altGreetingExpandBtn.getAttribute('data-greeting-index') || '-1', 10);
            if (greetingIndex >= 0) {
                actions.expandAltGreeting(greetingIndex);
            }
            return;
        }
    });

    // Field checkbox changes - delegation
    charSection.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;

        // Main field checkbox
        if (target.classList.contains(`${MODULE_NAME}_field_checkbox`)) {
            const fieldKey = target.dataset.field;
            const isArray = target.dataset.isArray === 'true';
            if (fieldKey) {
                actions.toggleField(fieldKey, isArray);
            }
            return;
        }

        // Alt greeting checkbox
        if (target.classList.contains(`${MODULE_NAME}_alt_greeting_checkbox`)) {
            const fieldKey = target.dataset.field;
            const index = parseInt(target.dataset.index || '-1', 10);
            if (fieldKey && index >= 0) {
                actions.toggleAltGreeting(fieldKey, index, target.checked);
            }
            return;
        }
    });
}

// ============================================================================
// SESSION SECTION EVENTS
// ============================================================================

// ============================================================================
// SESSION SECTION EVENTS
// ============================================================================

function initSessionSectionEvents(container: HTMLElement): void {
    const sessionContainer = container.querySelector(`#${MODULE_NAME}_session_container`);
    if (!sessionContainer) return;

    sessionContainer.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;

        // Toggle expand/collapse - either the toggle button or clicking the left side of header
        if (target.closest(`#${MODULE_NAME}_session_toggle_btn`) || target.closest(`#${MODULE_NAME}_session_toggle`)) {
            actions.toggleSessionListExpanded();
            return;
        }

        // Save session
        if (target.closest(`#${MODULE_NAME}_save_session_btn`)) {
            await actions.saveCurrentSession();
            return;
        }

        // New session
        if (target.closest(`#${MODULE_NAME}_new_session_btn`)) {
            await actions.createNewSession();
            return;
        }

        // Clear all sessions
        if (target.closest(`#${MODULE_NAME}_clear_all_sessions_btn`)) {
            await actions.clearAllSessions();
            return;
        }

        // Load session
        const loadBtn = target.closest(`.${MODULE_NAME}_session_load_btn`);
        if (loadBtn) {
            const sessionId = loadBtn.getAttribute('data-session-id');
            if (sessionId) {
                await actions.loadSession(sessionId);
            }
            return;
        }

        // Rename session
        const renameBtn = target.closest(`.${MODULE_NAME}_session_rename_btn`);
        if (renameBtn) {
            const sessionId = renameBtn.getAttribute('data-session-id');
            if (sessionId) {
                await actions.renameSession(sessionId);
            }
            return;
        }

        // Delete session
        const deleteBtn = target.closest(`.${MODULE_NAME}_session_delete_btn`);
        if (deleteBtn) {
            const sessionId = deleteBtn.getAttribute('data-session-id');
            if (sessionId) {
                await actions.deleteSessionById(sessionId);
            }
            return;
        }
    });
}


// ============================================================================
// PIPELINE SECTION EVENTS
// ============================================================================

function initPipelineSectionEvents(container: HTMLElement): void {
    const pipelineSection = container.querySelector(`#${MODULE_NAME}_pipeline_nav_container`);
    if (!pipelineSection) return;

    // Stage checkbox changes
    pipelineSection.addEventListener('change', (e) => {
        const checkbox = e.target as HTMLInputElement;
        if (checkbox.classList.contains(`${MODULE_NAME}_stage_checkbox`)) {
            const stage = checkbox.getAttribute('data-stage') as StageName;
            if (stage) {
                actions.toggleStageSelection(stage);
            }
        }
    });

    // Click delegation
    pipelineSection.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const state = getState();
        if (!state) return;

        // Stage button - switch active view
        const stageBtn = target.closest(`.${MODULE_NAME}_stage_btn`);
        if (stageBtn) {
            const stage = stageBtn.getAttribute('data-stage') as StageName;
            if (stage) {
                actions.setActiveStage(stage);
            }
            return;
        }

        // Run selected stage
        if (target.closest(`#${MODULE_NAME}_run_selected_btn`)) {
            await actions.runSingleStage(state.activeStageView);
            return;
        }

        // Run all stages
        if (target.closest(`#${MODULE_NAME}_run_all_btn`)) {
            await actions.runAllStages();
            return;
        }

        // Reset pipeline
        if (target.closest(`#${MODULE_NAME}_reset_pipeline_btn`)) {
            await actions.resetCurrentPipeline();
            return;
        }
    });
}

// ============================================================================
// STAGE CONFIG EVENTS
// ============================================================================

function initStageConfigEvents(container: HTMLElement): void {
    const { lodash } = SillyTavern.libs;

    const stageSection = container.querySelector(`#${MODULE_NAME}_stage_config_container`);
    if (!stageSection) return;

    stageSection.querySelectorAll<HTMLDetailsElement>('[data-config-disclosure]').forEach(details => {
        details.addEventListener('toggle', () => {
            const section = details.dataset.configDisclosure;
            if (section === 'prompt' || section === 'schema') {
                setConfigDisclosure(section, details.open);
            }
        });
    });

    // Select changes
    stageSection.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement | HTMLInputElement;

        // Prompt preset select
        if (target.id === `${MODULE_NAME}_prompt_preset_select`) {
            actions.setPromptPreset((target as HTMLSelectElement).value || null);
            return;
        }

        // Schema preset select
        if (target.id === `${MODULE_NAME}_schema_preset_select`) {
            actions.setSchemaPreset((target as HTMLSelectElement).value || null);
            return;
        }

        // Structured output toggle
        if (target.id === `${MODULE_NAME}_use_structured`) {
            actions.toggleStructuredOutput((target as HTMLInputElement).checked);
            return;
        }
    });

    // Debounced input handlers for textareas
    const debouncedPromptUpdate = lodash.debounce((value: string) => {
        actions.updateCustomPrompt(value);
    }, 300);
    trackDebouncedFunction(debouncedPromptUpdate);

    const debouncedSchemaUpdate = lodash.debounce((value: string) => {
        actions.updateCustomSchema(value);
    }, 300);
    trackDebouncedFunction(debouncedSchemaUpdate);

    stageSection.addEventListener('input', (e) => {
        const target = e.target as HTMLTextAreaElement;

        if (target.id === `${MODULE_NAME}_custom_prompt`) {
            debouncedPromptUpdate(target.value);
            return;
        }

        if (target.id === `${MODULE_NAME}_custom_schema`) {
            debouncedSchemaUpdate(target.value);
            return;
        }
    });

    // Click delegation
    stageSection.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;

        // Save prompt preset
        if (target.closest(`#${MODULE_NAME}_save_prompt_preset_btn`)) {
            await actions.saveCurrentPromptAsPreset();
            return;
        }

        // Save schema preset
        if (target.closest(`#${MODULE_NAME}_save_schema_preset_btn`)) {
            await actions.saveCurrentSchemaAsPreset();
            return;
        }

        // Generate schema
        if (target.closest(`#${MODULE_NAME}_generate_schema_btn`)) {
            await actions.generateSchema();
            return;
        }

        // Validate schema
        if (target.closest(`#${MODULE_NAME}_validate_schema_btn`)) {
            await actions.validateCurrentSchema();
            return;
        }

        // Fix schema
        if (target.closest(`#${MODULE_NAME}_fix_schema_btn`)) {
            actions.fixCurrentSchema();
            return;
        }

        // Format schema
        if (target.closest(`#${MODULE_NAME}_format_schema_btn`)) {
            actions.formatCurrentSchema();
            return;
        }

        // Preview prompt
        if (target.closest(`#${MODULE_NAME}_preview_prompt_btn`)) {
            await actions.previewPrompt();
            return;
        }
    });
}

// ============================================================================
// RESULTS EVENTS
// ============================================================================

function initResultsEvents(container: HTMLElement): void {
    // Attach to the SECTION wrapper, not the container that gets innerHTML replaced
    const resultsSection = container.querySelector(`#${MODULE_NAME}_results_section`);
    if (!resultsSection) return;

    resultsSection.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const state = getState();
        if (!state) return;

        // Regenerate
        if (target.closest(`#${MODULE_NAME}_regenerate_btn`)) {
            await actions.regenerateResult();
            return;
        }

        // Lock
        if (target.closest(`#${MODULE_NAME}_lock_btn`)) {
            actions.lockResult();
            return;
        }

        // Unlock
        if (target.closest(`#${MODULE_NAME}_unlock_btn`)) {
            actions.unlockResult();
            return;
        }

        // Copy
        if (target.closest(`#${MODULE_NAME}_copy_btn`)) {
            await actions.copyResultToClipboard();
            return;
        }

        if (target.closest(`#${MODULE_NAME}_apply_rewrite_btn`)) {
            await actions.applySelectedRewriteFields();
            return;
        }

        if (target.closest(`#${MODULE_NAME}_revert_write_btn`)) {
            await actions.revertAppliedRewrite();
            return;
        }

        // Continue to next stage
        if (target.closest(`#${MODULE_NAME}_continue_btn`)) {
            actions.continueToNextStage();
            return;
        }

        // Run analyze after refinement
        if (target.closest(`#${MODULE_NAME}_run_analyze_btn`)) {
            await actions.runAnalyzeAfterRefinement();
            return;
        }

        // Refine
        if (target.closest(`#${MODULE_NAME}_refine_btn`)) {
            await actions.runRefinement();
            return;
        }

        // Accept rewrite
        if (target.closest(`#${MODULE_NAME}_accept_btn`)) {
            actions.acceptRewrite();
            return;
        }

        // Export
        if (target.closest(`#${MODULE_NAME}_export_btn`)) {
            actions.exportSession();
            return;
        }

        // Cancel generation
        if (target.closest(`#${MODULE_NAME}_cancel_btn`)) {
            actions.cancelGeneration();
            return;
        }
    });
}



// ============================================================================
// ITERATION HISTORY EVENTS
// ============================================================================

function initIterationHistoryEvents(container: HTMLElement): void {
    const historySection = container.querySelector(`#${MODULE_NAME}_iteration_history_container`);
    if (!historySection) return;

    historySection.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;

        // Collapse toggle
        if (target.closest(`#${MODULE_NAME}_iteration_header_toggle`)) {
            actions.toggleIterationHistoryCollapse();
            return;
        }

        // Revert button
        const revertBtn = target.closest(`.${MODULE_NAME}_iteration_revert_btn`);
        if (revertBtn) {
            const index = parseInt(revertBtn.getAttribute('data-index') || '-1', 10);
            if (index >= 0) {
                await actions.revertToIteration(index);
            }
            return;
        }

        // View button
        const viewBtn = target.closest(`.${MODULE_NAME}_iteration_view_btn`);
        if (viewBtn) {
            const index = parseInt(viewBtn.getAttribute('data-index') || '-1', 10);
            if (index >= 0) {
                await actions.viewIterationDetail(index);
            }
            return;
        }
    });
}

// ============================================================================
// HEADER EVENTS
// ============================================================================

function initHeaderEvents(container: HTMLElement): void {
    const collapseBtn = container.querySelector(`#${MODULE_NAME}_config_collapse_btn`) as HTMLButtonElement | null;
    collapseBtn?.addEventListener('click', () => {
        const collapsed = toggleConfigRail();
        const main = container.querySelector(`.${MODULE_NAME}_main_content`);
        main?.classList.toggle(`${MODULE_NAME}_config_collapsed`, collapsed);
        collapseBtn.setAttribute('aria-expanded', String(!collapsed));
        collapseBtn.setAttribute('aria-label', collapsed ? 'Expand configuration' : 'Collapse configuration');
        collapseBtn.title = collapsed ? 'Expand configuration' : 'Collapse configuration';
        const icon = collapseBtn.querySelector('i');
        if (icon) icon.className = `fa-solid ${collapsed ? 'fa-angles-right' : 'fa-angles-left'}`;
    });

    // Settings button
    const settingsBtn = container.querySelector(`#${MODULE_NAME}_settings_btn`);
    settingsBtn?.addEventListener('click', () => {
        openSettingsModal(() => {
            // Check for deleted preset references after settings close
            checkForDeletedPresetReferences();
            updateAllComponents();
        });
    });

    // Close button
    const closeBtn = container.querySelector(`#${MODULE_NAME}_close_btn`);
    closeBtn?.addEventListener('click', () => {
        closePopup();
    });
}

// ============================================================================
// DOCUMENT-LEVEL EVENTS
// ============================================================================

function initDocumentEvents(container: HTMLElement): void {
    // Close dropdown when clicking outside
    const closeDropdownHandler = (e: MouseEvent) => {
        const dropdown = container.querySelector(`#${MODULE_NAME}_char_dropdown`);
        const search = container.querySelector(`#${MODULE_NAME}_char_search`);

        if (dropdown && search &&
            !dropdown.contains(e.target as Node) &&
            !search.contains(e.target as Node)) {
            actions.closeSearchDropdown();
        }
    };

    document.addEventListener('click', closeDropdownHandler);
    addCleanupFunction(() => document.removeEventListener('click', closeDropdownHandler));
}

// ============================================================================
// HELPERS
// ============================================================================

function closePopup(): void {
    const el = getElement();
    if (!el) return;

    const dialog = el.closest('.popup');
    if (dialog) {
        const btn = dialog.querySelector('.popup-button-cancel, .popup-button-ok') as HTMLElement;
        btn?.click();
    }
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
