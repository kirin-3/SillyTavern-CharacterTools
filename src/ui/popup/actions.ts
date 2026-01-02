// src/ui/popup/actions.ts
// All user-triggered actions - the ONLY place that mutates state or triggers side effects

import { MODULE_NAME, STAGE_LABELS, STAGES } from '../../constants';
import { debugLog } from '../../debug';
import {
    getState,
    getElement,
    updateState,
    updatePipeline,
    markUnsavedChanges,
    clearUnsavedChanges,
    setSchemaValidationInCache,
} from './state';
import {
    updateAllComponents,
    updateCharacterSelect,
    updatePipelineNav,
    updateStageSection,
    updateResultsPanel,
    updateIterationHistory,
    updateSessionManager,
    updateTokenEstimate,
    updateStageConfigUI,
    updateIterationIndicator,
} from './updaters';
import { renderDropdownItems } from './components/character-select';
import { renderRefinementLoading } from './components/results-panel';
import { renderIterationViewContent } from './components/iteration-history';

// Core imports
import { getPopulatedFields } from '../../core/character';
import { getTokenCountsKeyed } from '../../core/tokens';
import {
    setCharacter,
    updateFieldSelection,
    selectAllFields as pipelineSelectAllFields,
    deselectAllFields as pipelineDeselectAllFields,
    toggleStage,
    resetPipeline,
    updateStageConfig as pipelineUpdateStageConfig,
    setSelectedStages,
    startStage,
    completeStage,
    failStage,
    canRunStage,
    canRefine,
    validateRefinement,
    buildStagePrompt,
    getStageSchema,
    startRefinement,
    completeRefinement,
    lockStageResult,
    unlockStageResult,
    clearStageResult,
    getNextStage,
    acceptRewrite as pipelineAcceptRewrite,
    generateExportData,
    revertToIteration as pipelineRevertToIteration,
    createPipelineState,
    initializeFieldSelection,
} from '../../core/pipeline';
import { isApiReady, runStageGeneration, getTokenCount } from '../../core/generator';
import {
    loadCharacterSessions,
    saveSession,
    deleteSession,
    deleteAllCharacterSessions,
    renameSession as persistenceRenameSession,
    restorePipelineFromSession,
    setActiveSession,
} from '../../core/persistence';
import {
    getFullSystemPrompt,
    savePromptPreset,
    saveSchemaPreset,
} from '../../core/settings';
import {
    validateSchema,
    autoFixSchema,
    generateSchemaFromDescription,
} from '../../core/schema';

import type { Character, StageName, PopulatedField } from '../../types';

// ============================================================================
// MODULE-LEVEL STATE (not in PopupState)
// ============================================================================

let abortController: AbortController | null = null;
let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;

let isSelectingCharacter = false;

// ============================================================================
// CHARACTER ACTIONS
// ============================================================================

export async function selectCharacter(char: Character, index: number): Promise<void> {
    const state = getState();
    const el = getElement();
    if (!state || !el) return;

    if (isSelectingCharacter) {
        debugLog('info', 'Already selecting character, ignoring', null);
        return;
    }

    isSelectingCharacter = true;
    const selectedIndex = index;

    try {
        const { unshallowCharacter, characters } = SillyTavern.getContext();

        try {
            await unshallowCharacter(index);
        } catch (e) {
            debugLog('error', 'Failed to unshallow character', { index, name: char.name, error: e });
            toastr.error(`Failed to load character data for ${char.name}`);
            return;
        }

        const s = getState();
        const currentEl = getElement();
        if (!s || !currentEl) {
            debugLog('info', 'Popup closed during character load', null);
            return;
        }

        const charList = characters as Character[];

        if (index < 0 || index >= charList.length) {
            debugLog('error', 'Character index out of bounds after unshallow', { index, listLength: charList.length });
            toastr.error('Character no longer available');
            return;
        }

        const fullChar = charList[index];

        if (!fullChar || !fullChar.name) {
            debugLog('error', 'Character data invalid after unshallow', { index, char: fullChar });
            toastr.error('Failed to load character data');
            return;
        }

        const populatedFields = getPopulatedFields(fullChar);
        if (populatedFields.length === 0) {
            debugLog('info', 'Character has no populated fields', { name: fullChar.name });
            toastr.warning(`${fullChar.name} has no content to analyze`);
        }

        updatePipeline(p => setCharacter(p, fullChar, index));
        updateState(() => ({
            sessionsLoaded: false,
            sessions: [],
            activeSessionId: null,
            searchState: { query: '', results: [], selectedIndex: -1 },
            historyLoaded: false,
        }));

        updateAllComponents();

        // Load sessions (non-blocking)
        loadCharacterSessions(fullChar).then(async data => {
            const currentState = getState();
            if (!currentState || currentState.pipeline.characterIndex !== selectedIndex) {
                debugLog('info', 'Character changed during session load, discarding', null);
                return;
            }

            updateState(() => ({
                sessions: data.sessions,
                activeSessionId: null,
                sessionsLoaded: true,
                historyLoaded: true,
            }));

            updateSessionManager();
            updateIterationHistory();
            updateResultsPanel();
            updatePipelineNav();
        }).catch(e => {
            debugLog('error', 'Failed to load sessions', e);
            const currentState = getState();
            if (currentState) {
                updateState(() => ({
                    sessionsLoaded: true,
                    historyLoaded: true,
                }));
                updateSessionManager();
            }
        });

        // Update token counts (non-blocking)
        setTimeout(() => updateTokenCountsForCharacter(), 50);

        debugLog('info', 'Character selected', {
            name: fullChar.name,
            index,
            fieldCount: populatedFields.length,
        });
    } finally {
        isSelectingCharacter = false;
    }
}

export function clearCharacter(): void {
    const state = getState();
    if (!state) return;

    updatePipeline(p => setCharacter(p, null, null));
    updateState(() => ({
        sessionsLoaded: false,
        sessions: [],
        activeSessionId: null,
    }));
    updateAllComponents();
}

export function selectAllFields(): void {
    const state = getState();
    if (!state?.pipeline.character) return;

    updatePipeline(p => pipelineSelectAllFields(p));
    updateCharacterSelect();
    updateTokenEstimate();
}

export function deselectAllFields(): void {
    const state = getState();
    if (!state) return;

    updatePipeline(p => pipelineDeselectAllFields(p));
    updateCharacterSelect();
    updateTokenEstimate();
}

export function toggleField(fieldKey: string, isArray: boolean): void {
    const state = getState();
    if (!state?.pipeline.character) return;

    if (isArray) {
        const field = getPopulatedFields(state.pipeline.character).find(f => f.key === fieldKey);
        if (field && Array.isArray(field.rawValue)) {
            const current = state.pipeline.selectedFields[fieldKey];
            const isCurrentlySelected = Array.isArray(current) && current.length > 0;
            const newValue = isCurrentlySelected ? [] : (field.rawValue as string[]).map((_, i) => i);
            updatePipeline(p => updateFieldSelection(p, fieldKey, newValue));
        }
    } else {
        const current = !!state.pipeline.selectedFields[fieldKey];
        updatePipeline(p => updateFieldSelection(p, fieldKey, !current));
    }

    updateCharacterSelect();
    updateTokenEstimate();
}

export function toggleAltGreeting(fieldKey: string, index: number, checked: boolean): void {
    const state = getState();
    if (!state) return;

    const current = (state.pipeline.selectedFields[fieldKey] as number[]) || [];
    let newValue: number[];

    if (checked) {
        newValue = [...current, index].sort((a, b) => a - b);
    } else {
        newValue = current.filter(i => i !== index);
    }

    updatePipeline(p => updateFieldSelection(p, fieldKey, newValue));
    updateCharacterSelect();
    updateTokenEstimate();
}

export function expandField(fieldKey: string): void {
    const el = getElement();
    if (!el) return;

    const content = el.querySelector(`#${MODULE_NAME}_field_content_${fieldKey}`);
    const btn = el.querySelector(`.${MODULE_NAME}_field_expand_btn[data-field="${fieldKey}"]`);
    const icon = btn?.querySelector('i');

    if (content && icon) {
        content.classList.toggle('hidden');
        icon.classList.toggle('fa-chevron-right');
        icon.classList.toggle('fa-chevron-down');
    }
}

export function expandAltGreeting(greetingIndex: number): void {
    const el = getElement();
    if (!el) return;

    const preview = el.querySelector(`#${MODULE_NAME}_alt_greeting_preview_${greetingIndex}`);
    const content = el.querySelector(`#${MODULE_NAME}_alt_greeting_content_${greetingIndex}`);
    const btn = el.querySelector(`.${MODULE_NAME}_alt_greeting_expand_btn[data-greeting-index="${greetingIndex}"]`);
    const icon = btn?.querySelector('i');

    if (preview && content && icon) {
        const isExpanded = !content.classList.contains('hidden');

        if (isExpanded) {
            content.classList.add('hidden');
            preview.classList.remove('hidden');
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-right');
        } else {
            preview.classList.add('hidden');
            content.classList.remove('hidden');
            icon.classList.remove('fa-chevron-right');
            icon.classList.add('fa-chevron-down');
        }
    }
}

// ============================================================================
// SEARCH ACTIONS
// ============================================================================

export function updateSearchQuery(query: string): void {
    const state = getState();
    const el = getElement();
    if (!state || !el) return;

    const dropdown = el.querySelector(`#${MODULE_NAME}_char_dropdown`) as HTMLElement;
    if (!dropdown) return;

    if (!query.trim()) {
        updateState(() => ({
            searchState: { query: '', results: [], selectedIndex: -1 },
        }));
        dropdown.classList.add('hidden');
        return;
    }

    const { Fuse } = SillyTavern.libs;
    const { characters } = SillyTavern.getContext();
    const currentChars = characters as Character[];

    const charData = currentChars
        .map((char, index) => ({ char, index }))
        .filter(({ char }) => char?.name);

    const fuse = new Fuse(charData, {
        keys: ['char.name', 'char.description'],
        threshold: 0.4,
        includeScore: true,
        minMatchCharLength: 1,
    });

    const results = fuse.search(query, { limit: 10 });
    const mappedResults = results.map((r: { item: { char: Character; index: number } }) => r.item);

    updateState(() => ({
        searchState: { query, results: mappedResults, selectedIndex: -1 },
    }));

    if (mappedResults.length === 0) {
        dropdown.innerHTML = `<div class="${MODULE_NAME}_dropdown_empty">No characters found</div>`;
    } else {
        renderDropdownItems(mappedResults, dropdown, -1);
    }
    dropdown.classList.remove('hidden');
}

export function selectSearchResult(characterIndex: number): void {
    const state = getState();
    if (!state) return;

    const result = state.searchState.results.find(r => r.index === characterIndex);
    if (result) {
        selectCharacter(result.char, result.index);
        closeSearchDropdown();
    }
}

export function navigateSearchResults(direction: 'up' | 'down'): void {
    const state = getState();
    const el = getElement();
    if (!state || !el || state.searchState.results.length === 0) return;

    const dropdown = el.querySelector(`#${MODULE_NAME}_char_dropdown`) as HTMLElement;
    if (!dropdown) return;

    let newIndex = state.searchState.selectedIndex;
    if (direction === 'down') {
        newIndex = Math.min(newIndex + 1, state.searchState.results.length - 1);
    } else {
        newIndex = Math.max(newIndex - 1, 0);
    }

    updateState(s => ({
        searchState: { ...s.searchState, selectedIndex: newIndex },
    }));

    renderDropdownItems(state.searchState.results, dropdown, newIndex);
}

export function closeSearchDropdown(): void {
    const state = getState();
    const el = getElement();
    if (!state || !el) return;

    const dropdown = el.querySelector(`#${MODULE_NAME}_char_dropdown`);
    const searchInput = el.querySelector(`#${MODULE_NAME}_char_search`) as HTMLInputElement;

    dropdown?.classList.add('hidden');
    if (searchInput) searchInput.value = '';

    updateState(() => ({
        searchState: { query: '', results: [], selectedIndex: -1 },
    }));
}

// ============================================================================
// PIPELINE ACTIONS
// ============================================================================

export function toggleStageSelection(stage: StageName): void {
    const state = getState();
    if (!state) return;

    updatePipeline(p => toggleStage(p, stage));
    updatePipelineNav();
    updateResultsPanel();
}

export function setActiveStage(stage: StageName): void {
    const state = getState();
    if (!state) return;

    updateState(() => ({ activeStageView: stage }));
    updateStageSection();
    updateResultsPanel();
    updateTokenEstimate();
    updatePipelineNav();
}

export async function resetCurrentPipeline(): Promise<void> {
    const state = getState();
    if (!state) return;

    const { Popup } = SillyTavern.getContext();

    const hasContent = state.pipeline.results.score ||
        state.pipeline.results.rewrite ||
        state.pipeline.iterationHistory.length > 0;

    if (hasContent) {
        const confirmed = await Popup.show.confirm(
            'Reset Current Session?',
            'This will clear all results and start fresh. Your session will be saved first. Continue?',
        );

        if (!confirmed) return;

        if (state.pipeline.character && state.hasUnsavedChanges) {
            await saveSession(state.pipeline.character, state.pipeline, state.activeSessionId || undefined);
        }
    }

    const character = state.pipeline.character;
    const charIndex = state.pipeline.characterIndex;

    updatePipeline(p => {
        const reset = resetPipeline(p, true);
        return { ...reset, characterIndex: charIndex };
    });
    updateState(() => ({ hasUnsavedChanges: false }));

    if (character) {
        const sessionId = await saveSession(character, getState()!.pipeline, undefined, `Session ${state.sessions.length + 1}`);
        const data = await loadCharacterSessions(character);
        updateState(() => ({
            activeSessionId: sessionId,
            sessions: data.sessions,
        }));
    }

    updateAllComponents();
    toastr.info('Session reset');
}

// ============================================================================
// GENERATION ACTIONS
// ============================================================================

export async function runSingleStage(stage: StageName): Promise<void> {
    const state = getState();
    if (!state || state.isGenerating || state.isRefining) return;

    if (!isApiReady()) {
        toastr.error('API is not connected');
        return;
    }

    const canRun = canRunStage(state.pipeline, stage);
    if (!canRun.canRun) {
        toastr.warning(canRun.reason || 'Cannot run this stage');
        return;
    }

    if (canRun.reason) {
        toastr.info(canRun.reason);
    }

    updateState(() => ({ isGenerating: true }));
    abortController = new AbortController();
    updatePipeline(p => startStage(p, stage));
    updateAllComponents();

    const currentState = getState()!;
    const promptUsed = buildStagePrompt(currentState.pipeline, stage) || '';
    const schemaUsed = getStageSchema(currentState.pipeline, stage);

    try {
        const result = await runStageGeneration(
            currentState.pipeline,
            stage,
            abortController.signal,
        );

        const s = getState();
        if (!s) return;

        if (result.success) {
            updatePipeline(p => completeStage(p, stage, {
                response: result.response,
                isStructured: result.isStructured,
                promptUsed,
                schemaUsed,
            }));
            toastr.success(`${STAGE_LABELS[stage]} complete`);
            scheduleAutoSave();
        } else {
            updatePipeline(p => failStage(p, stage, result.error));
            if (result.error !== 'Generation cancelled') {
                toastr.error(result.error);
            }
        }
    } catch (e) {
        const s = getState();
        if (s) {
            updatePipeline(p => failStage(p, stage, (e as Error).message));
        }
        toastr.error((e as Error).message);
    } finally {
        updateState(() => ({ isGenerating: false }));
        abortController = null;
        setTimeout(() => updateAllComponents(), 0);
    }
}

export async function runSelectedStages(): Promise<void> {
    const state = getState();
    if (!state || state.isGenerating || state.isRefining) return;

    if (!isApiReady()) {
        toastr.error('API is not connected');
        return;
    }

    if (!state.pipeline.character) {
        toastr.error('No character selected');
        return;
    }

    const hasSelectedFields = Object.values(state.pipeline.selectedFields).some(v =>
        v === true || (Array.isArray(v) && v.length > 0),
    );

    if (!hasSelectedFields) {
        toastr.error('No fields selected');
        return;
    }

    if (state.pipeline.selectedStages.length === 0) {
        toastr.error('No stages selected');
        return;
    }

    for (const stage of state.pipeline.selectedStages) {
        const s = getState();
        if (!s) break;

        const status = s.pipeline.stageStatus[stage];
        if (status === 'complete' || status === 'skipped') {
            continue;
        }

        updateState(() => ({ activeStageView: stage }));
        updateStageSection();
        updatePipelineNav();
        updateResultsPanel();

        await runSingleStage(stage);

        const currentState = getState();
        if (!currentState) break;

        const newStatus = currentState.pipeline.stageStatus[stage];
        if (newStatus !== 'complete') {
            break;
        }
    }

    setTimeout(() => updateAllComponents(), 0);
}

export async function runAllStages(): Promise<void> {
    const state = getState();
    if (!state) return;

    updatePipeline(p => setSelectedStages(p, [...STAGES]));
    updatePipelineNav();
    updateResultsPanel();

    await runSelectedStages();
}

export async function runRefinement(): Promise<void> {
    debugLog('info', 'runRefinement CALLED', null);  // ADD THIS
    const state = getState();
    const el = getElement();

    debugLog('info', 'runRefinement state check', {  // ADD THIS
        hasState: !!state,
        hasEl: !!el,
        isGenerating: state?.isGenerating,
        isRefining: state?.isRefining,
    });

    if (!state || !el || state.isGenerating || state.isRefining) return;

    if (!isApiReady()) {
        toastr.error('API is not connected');
        return;
    }

    const canRefineResult = canRefine(state.pipeline);
    if (!canRefineResult.canRun) {
        toastr.warning(canRefineResult.reason || 'Cannot refine');
        return;
    }

    const validation = validateRefinement(state.pipeline);
    if (!validation.valid) {
        toastr.error(validation.errors.join('\n'));
        return;
    }

    if (validation.warnings.length > 0) {
        toastr.warning(validation.warnings.join('\n'));
    }

    // Snapshot current state before modifying
    const preRefinementState = {
        iterationCount: state.pipeline.iterationCount,
        iterationHistory: [...state.pipeline.iterationHistory],
        analyzeResult: state.pipeline.results.analyze,
    };

    // Start refinement - this sets isRefining=true and increments iteration
    updatePipeline(p => startRefinement(p));
    updateState(() => ({ isRefining: true }));
    abortController = new AbortController();

    const resultsContainer = el.querySelector(`#${MODULE_NAME}_results_container`);
    if (resultsContainer) {
        resultsContainer.innerHTML = renderRefinementLoading(getState()!.pipeline.iterationCount);
    }

    updateIterationIndicator();
    updateIterationHistory();

    try {
        // Refinement is just a rewrite stage run when isRefining=true
        // buildStagePrompt handles the refinement prompt internally
        const currentState = getState()!;
        const result = await runStageGeneration(
            currentState.pipeline,
            'rewrite',
            abortController.signal,
        );

        const s = getState();
        if (!s) return;

        if (result.success) {
            updatePipeline(p => completeRefinement(p, {
                response: result.response,
                reasoning: result.reasoning,
                isStructured: false,
                promptUsed: '[Refinement prompt]',
                schemaUsed: null,
            }));

            toastr.success(`Refinement #${getState()!.pipeline.iterationCount} complete`);
            scheduleAutoSave();

            updateState(() => ({ activeStageView: 'rewrite' }));
        } else {
            // Restore pre-refinement state on failure
            updatePipeline(p => ({
                ...p,
                iterationCount: preRefinementState.iterationCount,
                iterationHistory: preRefinementState.iterationHistory,
                results: {
                    ...p.results,
                    analyze: preRefinementState.analyzeResult,
                },
                stageStatus: {
                    ...p.stageStatus,
                    analyze: 'complete',
                },
                isRefining: preRefinementState.iterationCount > 0,
            }));

            if (result.error !== 'Generation cancelled') {
                toastr.error(result.error);
            }
        }
    } catch (e) {
        const s = getState();
        if (s) {
            // Restore pre-refinement state on error
            updatePipeline(p => ({
                ...p,
                iterationCount: preRefinementState.iterationCount,
                iterationHistory: preRefinementState.iterationHistory,
                results: {
                    ...p.results,
                    analyze: preRefinementState.analyzeResult,
                },
                stageStatus: {
                    ...p.stageStatus,
                    analyze: 'complete',
                },
                isRefining: preRefinementState.iterationCount > 0,
            }));
        }
        toastr.error((e as Error).message);
    } finally {
        updateState(() => ({ isRefining: false }));
        abortController = null;
        setTimeout(() => updateAllComponents(), 0);
    }
}


export function cancelGeneration(): void {
    if (abortController) {
        abortController.abort();
    }
    const { stopGeneration } = SillyTavern.getContext();
    if (typeof stopGeneration === 'function') {
        stopGeneration();
    }
}

// ============================================================================
// RESULTS ACTIONS
// ============================================================================

export function lockResult(): void {
    const state = getState();
    if (!state) return;

    updatePipeline(p => lockStageResult(p, state.activeStageView));
    updateResultsPanel();
}

export function unlockResult(): void {
    const state = getState();
    if (!state) return;

    updatePipeline(p => unlockStageResult(p, state.activeStageView));
    updateResultsPanel();
}

export async function regenerateResult(): Promise<void> {
    const state = getState();
    if (!state) return;

    updatePipeline(p => clearStageResult(p, state.activeStageView));
    await runSingleStage(state.activeStageView);
}

export async function copyResultToClipboard(): Promise<void> {
    const state = getState();
    if (!state) return;

    const result = state.pipeline.results[state.activeStageView];
    if (result) {
        await navigator.clipboard.writeText(result.response);
        toastr.success('Copied to clipboard');
    }
}

export function continueToNextStage(): void {
    const state = getState();
    if (!state) return;

    const nextStage = getNextStage(state.pipeline, state.activeStageView);
    if (nextStage) {
        setActiveStage(nextStage);
    }
}

export async function runAnalyzeAfterRefinement(): Promise<void> {
    setActiveStage('analyze');
    await runSingleStage('analyze');
}

export function acceptRewrite(): void {
    const state = getState();
    if (!state) return;

    updatePipeline(p => pipelineAcceptRewrite(p));
    toastr.success('Rewrite accepted as final');
    updateAllComponents();
}

export function exportSession(): void {
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

// ============================================================================
// ITERATION ACTIONS
// ============================================================================

export async function revertToIteration(iterationIndex: number): Promise<void> {
    const state = getState();
    if (!state) return;

    const { Popup } = SillyTavern.getContext();

    const iteration = state.pipeline.iterationHistory[iterationIndex];
    if (!iteration) {
        toastr.error('Iteration not found');
        return;
    }

    const confirmed = await Popup.show.confirm(
        'Revert to Iteration?',
        `Revert to iteration ${iterationIndex + 1}? Current results will be replaced.`,
    );

    if (!confirmed) return;

    updatePipeline(p => pipelineRevertToIteration(p, iterationIndex));
    markUnsavedChanges();
    scheduleAutoSave();

    updateAllComponents();
    toastr.success(`Reverted to iteration ${iterationIndex + 1}`);

    debugLog('info', 'Reverted iteration', { index: iterationIndex });
}

export async function viewIterationDetail(iterationIndex: number): Promise<void> {
    const state = getState();
    if (!state) return;

    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const { DOMPurify } = SillyTavern.libs;

    const iteration = state.pipeline.iterationHistory[iterationIndex];
    if (!iteration) {
        toastr.error('Iteration not found');
        return;
    }

    const content = renderIterationViewContent(iteration);

    await new Popup(DOMPurify.sanitize(content), POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: 'Close',
        cancelButton: false,
    }).show();
}

export function toggleIterationHistoryCollapse(): void {
    const el = getElement();
    if (!el) return;

    const historyEl = el.querySelector(`#${MODULE_NAME}_iteration_history`);
    historyEl?.classList.toggle('collapsed');
}

export function toggleSessionListExpanded(): void {
    const state = getState();
    if (!state) return;

    updateState(s => ({ sessionListExpanded: !s.sessionListExpanded }));
    updateSessionManager();
}

// ============================================================================
// SESSION ACTIONS
// ============================================================================

export async function saveCurrentSession(label?: string): Promise<void> {
    const state = getState();
    if (!state?.pipeline.character) {
        toastr.warning('No character selected');
        return;
    }

    try {
        const sessionId = await saveSession(
            state.pipeline.character,
            state.pipeline,
            state.activeSessionId || undefined,
            label,
        );

        updateState(() => ({ activeSessionId: sessionId }));
        clearUnsavedChanges();

        const data = await loadCharacterSessions(state.pipeline.character);
        updateState(() => ({ sessions: data.sessions }));

        updateSessionManager();
        toastr.success('Session saved');
    } catch (err) {
        toastr.error('Failed to save session');
        debugLog('error', 'Save session failed', err);
    }
}

export async function createNewSession(): Promise<void> {
    const state = getState();
    if (!state?.pipeline.character) return;

    const { Popup } = SillyTavern.getContext();

    if (state.hasUnsavedChanges) {
        const save = await Popup.show.confirm(
            'Unsaved Changes',
            'You have unsaved changes. Save before starting a new session?',
        );

        if (save) {
            await saveCurrentSession();
        }
    }

    const label = await Popup.show.input(
        'New Session',
        'Enter a name for this session:',
        `Session ${state.sessions.length + 1}`,
    );

    if (!label) return;

    const character = state.pipeline.character;
    const characterIndex = state.pipeline.characterIndex;

    const newPipeline = createPipelineState();
    newPipeline.character = character;
    newPipeline.characterIndex = characterIndex;
    newPipeline.selectedFields = initializeFieldSelection(character);

    updatePipeline(() => newPipeline);

    try {
        const sessionId = await saveSession(
            character,
            getState()!.pipeline,
            undefined,
            label.trim() || undefined,
        );

        updateState(() => ({ activeSessionId: sessionId }));
        clearUnsavedChanges();

        const data = await loadCharacterSessions(character);
        updateState(() => ({ sessions: data.sessions }));

        updateAllComponents();
        toastr.success('New session created');
    } catch (err) {
        toastr.error('Failed to create session');
        debugLog('error', 'Create session failed', err);
    }
}

export async function loadSession(sessionId: string): Promise<void> {
    const state = getState();
    if (!state?.pipeline.character) return;

    const character = state.pipeline.character;

    const { Popup } = SillyTavern.getContext();

    if (state.hasUnsavedChanges) {
        const save = await Popup.show.confirm(
            'Unsaved Changes',
            'You have unsaved changes. Save before loading another session?',
        );

        if (save) {
            await saveCurrentSession();
        }
    }

    const session = state.sessions.find(s => s.id === sessionId);
    if (!session) {
        toastr.error('Session not found');
        return;
    }

    updatePipeline(() => restorePipelineFromSession(
        session,
        character,
        state.pipeline.characterIndex!,
    ));

    updateState(() => ({ activeSessionId: sessionId }));
    clearUnsavedChanges();

    await setActiveSession(character, sessionId);

    updateAllComponents();
    toastr.success(`Loaded: ${session.label}`);
}

export async function renameSession(sessionId: string): Promise<void> {
    const state = getState();
    if (!state?.pipeline.character) return;

    const { Popup } = SillyTavern.getContext();

    const session = state.sessions.find(s => s.id === sessionId);
    if (!session) return;

    const newLabel = await Popup.show.input(
        'Rename Session',
        'Enter a new name:',
        session.label,
    );

    if (!newLabel || !newLabel.trim()) return;

    const success = await persistenceRenameSession(state.pipeline.character, sessionId, newLabel.trim());

    if (success) {
        const data = await loadCharacterSessions(state.pipeline.character);
        updateState(() => ({ sessions: data.sessions }));
        updateSessionManager();
        toastr.success('Session renamed');
    } else {
        toastr.error('Failed to rename session');
    }
}

export async function deleteSessionById(sessionId: string): Promise<void> {
    const state = getState();
    if (!state?.pipeline.character) return;

    const { Popup } = SillyTavern.getContext();

    const session = state.sessions.find(s => s.id === sessionId);
    if (!session) return;

    const confirmed = await Popup.show.confirm(
        'Delete Session?',
        `Delete "${session.label}"? This cannot be undone.`,
    );

    if (!confirmed) return;

    const wasActive = sessionId === state.activeSessionId;
    const success = await deleteSession(state.pipeline.character, sessionId);

    if (success) {
        const data = await loadCharacterSessions(state.pipeline.character);
        updateState(() => ({
            sessions: data.sessions,
            activeSessionId: data.activeSessionId,
        }));

        if (wasActive) {
            if (data.activeSessionId && data.sessions.length > 0) {
                const newActive = data.sessions.find(s => s.id === data.activeSessionId);
                if (newActive && state.pipeline.character) {
                    updatePipeline(() => restorePipelineFromSession(
                        newActive,
                        state.pipeline.character!,
                        state.pipeline.characterIndex!,
                    ));
                }
            } else if (state.pipeline.character) {
                const character = state.pipeline.character;
                const characterIndex = state.pipeline.characterIndex;
                const newPipeline = createPipelineState();
                newPipeline.character = character;
                newPipeline.characterIndex = characterIndex;
                newPipeline.selectedFields = initializeFieldSelection(character);
                updatePipeline(() => newPipeline);
            }
            clearUnsavedChanges();
        }

        updateAllComponents();
        toastr.success('Session deleted');
    } else {
        toastr.error('Failed to delete session');
    }
}

export async function clearAllSessions(): Promise<void> {
    const state = getState();
    if (!state?.pipeline.character) return;

    const character = state.pipeline.character;

    const { Popup } = SillyTavern.getContext();

    const confirmed = await Popup.show.confirm(
        'Clear All Sessions?',
        `Delete ALL sessions for ${character.name}? This cannot be undone.`,
    );

    if (!confirmed) return;

    const count = await deleteAllCharacterSessions(character);

    const characterIndex = state.pipeline.characterIndex;
    const newPipeline = createPipelineState();
    newPipeline.character = character;
    newPipeline.characterIndex = characterIndex;
    newPipeline.selectedFields = initializeFieldSelection(character);

    updatePipeline(() => newPipeline);
    updateState(() => ({
        sessions: [],
        activeSessionId: null,
    }));
    clearUnsavedChanges();

    updateAllComponents();
    toastr.success(`Deleted ${count} session(s)`);
}

export function scheduleAutoSave(): void {
    const state = getState();
    if (!state?.pipeline.character) return;

    markUnsavedChanges();
    updateSessionManager();

    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }

    autoSaveTimeout = setTimeout(async () => {
        const currentState = getState();
        if (!currentState?.pipeline.character || !currentState.hasUnsavedChanges) return;

        const character = currentState.pipeline.character;

        const hasContent = currentState.pipeline.results.score ||
            currentState.pipeline.results.rewrite ||
            currentState.pipeline.iterationHistory.length > 0;

        if (hasContent) {
            try {
                await saveSession(
                    character,
                    currentState.pipeline,
                    currentState.activeSessionId || undefined,
                );

                const data = await loadCharacterSessions(character);
                updateState(() => ({
                    activeSessionId: data.activeSessionId,
                    sessions: data.sessions,
                }));
                clearUnsavedChanges();

                updateSessionManager();
                debugLog('info', 'Auto-saved session', { sessionId: getState()?.activeSessionId });
            } catch (err) {
                debugLog('error', 'Auto-save failed', err);
            }
        }
    }, 10000);
}

export function cancelAutoSave(): void {
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
    }
}

export async function forceSave(): Promise<void> {
    cancelAutoSave();

    const state = getState();
    if (!state?.pipeline.character || !state.hasUnsavedChanges) return;

    const hasContent = state.pipeline.results.score ||
        state.pipeline.results.rewrite ||
        state.pipeline.iterationHistory.length > 0;

    if (hasContent) {
        try {
            await saveSession(
                state.pipeline.character,
                state.pipeline,
                state.activeSessionId || undefined,
            );
            debugLog('info', 'Force-saved session on close', null);
        } catch (err) {
            debugLog('error', 'Force-save failed', err);
        }
    }
}

// ============================================================================
// STAGE CONFIG ACTIONS
// ============================================================================

export function setPromptPreset(presetId: string | null): void {
    const state = getState();
    if (!state) return;

    updatePipeline(p => pipelineUpdateStageConfig(p, state.activeStageView, {
        promptPresetId: presetId,
    }));
    updateStageConfigUI();
    updateTokenEstimate();
}

export function setSchemaPreset(presetId: string | null): void {
    const state = getState();
    if (!state) return;

    updatePipeline(p => pipelineUpdateStageConfig(p, state.activeStageView, {
        schemaPresetId: presetId,
    }));
    updateStageConfigUI();
}

export function updateCustomPrompt(value: string): void {
    const state = getState();
    if (!state) return;

    updatePipeline(p => pipelineUpdateStageConfig(p, state.activeStageView, {
        customPrompt: value,
        promptPresetId: null,
    }));
    updateTokenEstimate();
    updateStageConfigUI();
}

export function updateCustomSchema(value: string): void {
    const state = getState();
    if (!state) return;

    updatePipeline(p => pipelineUpdateStageConfig(p, state.activeStageView, {
        customSchema: value,
        schemaPresetId: null,
    }));

    // Validate and cache
    if (value.trim()) {
        const validation = validateSchema(value);
        setSchemaValidationInCache(value, validation);
    }

    updateStageConfigUI();
}

export function toggleStructuredOutput(enabled: boolean): void {
    const state = getState();
    if (!state) return;

    updatePipeline(p => pipelineUpdateStageConfig(p, state.activeStageView, {
        useStructuredOutput: enabled,
    }));
    updateStageConfigUI();
}

export async function generateSchema(): Promise<void> {
    const { Popup } = SillyTavern.getContext();

    const description = await Popup.show.input(
        'Generate Schema',
        'Describe the structure you want (e.g., "scores for each field 1-10, list of suggestions, overall rating"):',
        '',
    );

    if (!description || !description.trim()) {
        return;
    }

    showSchemaGenerationLoading(true);

    try {
        toastr.info('Generating schema...');

        const result = await generateSchemaFromDescription(description);

        if (result.success && result.schema) {
            const el = getElement();
            const schemaTextarea = el?.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
            if (schemaTextarea) {
                schemaTextarea.value = result.schema;
            }
            updateCustomSchema(result.schema);
            toastr.success('Schema generated!');
        } else {
            toastr.error(result.error || 'Generation failed');
            if (result.schema) {
                const el = getElement();
                const schemaTextarea = el?.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
                if (schemaTextarea) {
                    schemaTextarea.value = result.schema;
                }
                updateCustomSchema(result.schema);
            }
        }
    } finally {
        showSchemaGenerationLoading(false);
    }
}

export async function validateCurrentSchema(): Promise<void> {
    const el = getElement();
    const schemaTextarea = el?.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
    const schemaContent = schemaTextarea?.value || '';

    if (!schemaContent.trim()) {
        toastr.warning('No schema to validate');
        return;
    }

    const validation = validateSchema(schemaContent);
    setSchemaValidationInCache(schemaContent, validation);

    if (!validation.valid) {
        toastr.error(`Invalid: ${validation.error}`);
        return;
    }

    const { Popup, POPUP_TYPE } = SillyTavern.getContext();

    if (validation.warnings?.length) {
        if (validation.warnings.length > 2) {
            const content = `
                <h3>Schema Valid with Warnings</h3>
                <ul>
                    ${validation.warnings.map(w => `<li>${w}</li>`).join('')}
                </ul>
            `;
            await new Popup(content, POPUP_TYPE.TEXT, '', { wide: false }).show();
        } else {
            toastr.warning(`Valid with ${validation.warnings.length} warning(s):\n${validation.warnings.join('\n')}`);
        }
        return;
    }

    if (validation.info?.length) {
        if (validation.info.length > 2) {
            const content = `
                <h3>Schema Valid</h3>
                <ul>
                    ${validation.info.map(i => `<li>${i}</li>`).join('')}
                </ul>
            `;
            await new Popup(content, POPUP_TYPE.TEXT, '', { wide: false }).show();
        } else {
            toastr.success(`Valid!\n${validation.info.join('\n')}`);
        }
    } else {
        toastr.success('Schema is valid!');
    }
}

export function fixCurrentSchema(): void {
    const el = getElement();
    const schemaTextarea = el?.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
    const schemaContent = schemaTextarea?.value || '';

    if (!schemaContent.trim()) {
        toastr.warning('No schema to fix');
        return;
    }

    const validation = validateSchema(schemaContent);

    if (!validation.schema) {
        toastr.error('Cannot fix: schema is not valid JSON or missing required structure');
        return;
    }

    try {
        const fixed = autoFixSchema(validation.schema);
        const fixedJson = JSON.stringify(fixed, null, 2);

        if (schemaTextarea) {
            schemaTextarea.value = fixedJson;
        }
        updateCustomSchema(fixedJson);

        const revalidation = validateSchema(fixedJson);
        setSchemaValidationInCache(fixedJson, revalidation);

        if (!revalidation.valid) {
            toastr.warning('Auto-fix applied but schema still has issues');
        } else if (revalidation.warnings?.length) {
            toastr.info(`Fixed! ${revalidation.warnings.length} warning(s) remain`);
        } else {
            toastr.success('Schema fixed successfully!');
        }
    } catch (e) {
        toastr.error(`Fix failed: ${(e as Error).message}`);
    }
}

export function formatCurrentSchema(): void {
    const el = getElement();
    const schemaTextarea = el?.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
    const schemaContent = schemaTextarea?.value || '';

    if (!schemaContent.trim()) {
        toastr.warning('No schema to format');
        return;
    }

    try {
        const parsed = JSON.parse(schemaContent);
        const formatted = JSON.stringify(parsed, null, 2);

        if (schemaTextarea) {
            schemaTextarea.value = formatted;
        }
        updateCustomSchema(formatted);
        toastr.success('Schema formatted');
    } catch (e) {
        toastr.error(`Cannot format: ${(e as Error).message}`);
    }
}

export async function saveCurrentPromptAsPreset(): Promise<void> {
    const state = getState();
    const el = getElement();
    if (!state || !el) return;

    const promptTextarea = el.querySelector(`#${MODULE_NAME}_custom_prompt`) as HTMLTextAreaElement;
    const promptContent = promptTextarea?.value || '';

    if (!promptContent.trim()) {
        toastr.warning('No prompt content to save');
        return;
    }

    const { Popup } = SillyTavern.getContext();

    const name = await Popup.show.input(
        'Save Prompt Preset',
        'Enter a name for this preset:',
        `Custom ${STAGE_LABELS[state.activeStageView]} Prompt`,
    );

    if (!name || !name.trim()) {
        if (name === null) return;
        toastr.warning('Preset name cannot be empty');
        return;
    }

    try {
        const newPreset = savePromptPreset({
            name: name.trim(),
            prompt: promptContent,
            stages: [state.activeStageView],
        });

        updatePipeline(p => pipelineUpdateStageConfig(p, state.activeStageView, {
            promptPresetId: newPreset.id,
            customPrompt: '',
        }));
        updateStageConfigUI();
        toastr.success(`Prompt preset "${name}" saved`);
    } catch (e) {
        toastr.error(`Failed to save preset: ${(e as Error).message}`);
    }
}

export async function saveCurrentSchemaAsPreset(): Promise<void> {
    const state = getState();
    const el = getElement();
    if (!state || !el) return;

    const schemaTextarea = el.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
    const schemaContent = schemaTextarea?.value || '';

    if (!schemaContent.trim()) {
        toastr.warning('No schema content to save');
        return;
    }

    const validation = validateSchema(schemaContent);
    if (!validation.valid) {
        toastr.error(`Invalid schema: ${validation.error}`);
        return;
    }

    const { Popup } = SillyTavern.getContext();

    const name = await Popup.show.input(
        'Save Schema Preset',
        'Enter a name for this preset:',
        `Custom ${STAGE_LABELS[state.activeStageView]} Schema`,
    );

    if (!name || !name.trim()) {
        if (name === null) return;
        toastr.warning('Preset name cannot be empty');
        return;
    }

    try {
        const newPreset = saveSchemaPreset({
            name: name.trim(),
            schema: validation.schema!,
            stages: [state.activeStageView],
        });

        updatePipeline(p => pipelineUpdateStageConfig(p, state.activeStageView, {
            schemaPresetId: newPreset.id,
            customSchema: '',
        }));
        updateStageConfigUI();
        toastr.success(`Schema preset "${name}" saved`);
    } catch (e) {
        toastr.error(`Failed to save preset: ${(e as Error).message}`);
    }
}

export async function previewPrompt(): Promise<void> {
    const state = getState();
    if (!state?.pipeline.character) {
        toastr.warning('Select a character first');
        return;
    }

    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const { DOMPurify } = SillyTavern.libs;

    const stage = state.activeStageView;
    const fullPrompt = buildStagePrompt(state.pipeline, stage);
    const systemPrompt = getFullSystemPrompt(stage);

    if (!fullPrompt) {
        toastr.warning('No prompt configured');
        return;
    }

    const promptTokens = await getTokenCount(fullPrompt);
    const systemTokens = await getTokenCount(systemPrompt);
    const totalTokens = (promptTokens ?? 0) + (systemTokens ?? 0);

    const content = `
    <div class="${MODULE_NAME}_prompt_preview">
      <h3>Prompt Preview - ${STAGE_LABELS[stage]}</h3>

      <div class="${MODULE_NAME}_preview_section">
        <div class="${MODULE_NAME}_preview_header">
          <h4>System Prompt</h4>
          <span class="${MODULE_NAME}_preview_tokens">${systemTokens?.toLocaleString() ?? '?'} tokens</span>
        </div>
        <pre class="${MODULE_NAME}_preview_content">${DOMPurify.sanitize(systemPrompt, { ALLOWED_TAGS: [] })}</pre>
      </div>

      <div class="${MODULE_NAME}_preview_section">
        <div class="${MODULE_NAME}_preview_header">
          <h4>Stage Prompt</h4>
          <span class="${MODULE_NAME}_preview_tokens">${promptTokens?.toLocaleString() ?? '?'} tokens</span>
        </div>
        <pre class="${MODULE_NAME}_preview_content">${DOMPurify.sanitize(fullPrompt, { ALLOWED_TAGS: [] })}</pre>
      </div>

      <div class="${MODULE_NAME}_preview_total">
        <strong>Total: ${totalTokens.toLocaleString()} tokens</strong>
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

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

function showSchemaGenerationLoading(show: boolean): void {
    const existingOverlay = document.querySelector(`.${MODULE_NAME}_loading_overlay`);

    if (show && !existingOverlay) {
        const overlay = document.createElement('div');
        overlay.className = `${MODULE_NAME}_loading_overlay`;
        overlay.innerHTML = `
            <div class="${MODULE_NAME}_loading_content">
                <i class="fa-solid fa-spinner fa-spin fa-2x"></i>
                <p>Generating schema...</p>
            </div>
        `;
        document.body.appendChild(overlay);
    } else if (!show && existingOverlay) {
        existingOverlay.remove();
    }
}

async function updateTokenCountsForCharacter(): Promise<void> {
    const state = getState();
    const el = getElement();
    if (!state?.pipeline.character || !el) return;

    const container = el.querySelector(`#${MODULE_NAME}_character_select_container`);
    if (!container) return;

    const fields = getPopulatedFields(state.pipeline.character);
    await updateFieldTokenCountsInternal(container as HTMLElement, fields);
}

async function updateFieldTokenCountsInternal(container: HTMLElement, fields: PopulatedField[]): Promise<void> {
    // Use batch token counting from tokens.ts
    const items = fields.map(f => ({ key: f.key, text: f.value }));
    const results = await getTokenCountsKeyed(items);

    let totalTokens = 0;

    for (const { key, tokens } of results) {
        const tokenSpan = container.querySelector(`.${MODULE_NAME}_field_tokens[data-field="${key}"]`);
        if (tokenSpan) {
            if (tokens !== null) {
                totalTokens += tokens;
                tokenSpan.textContent = `${tokens.toLocaleString()}t`;
            } else {
                tokenSpan.textContent = '?';
            }
        }
    }

    const totalSpan = container.querySelector(`#${MODULE_NAME}_total_tokens`);
    if (totalSpan) {
        totalSpan.textContent = `${totalTokens.toLocaleString()} tokens`;
    }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Reset module-level action state. Called on popup close.
 */
export function resetActionState(): void {
    isSelectingCharacter = false;
    abortController = null;
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
    }
}
