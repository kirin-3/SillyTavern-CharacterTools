// src/ui/popup/lifecycle.ts
// Event subscription and global keyboard handlers

import { debugLog } from '../../debug';
import { isApiReady } from '../../generator';
import { clearTokenCache } from '../components/character-select';
import { setCharacter } from '../../pipeline';
import { getState, setState, setElement } from './state';
import { updateAllComponents, updateApiStatus, updateTokenEstimate } from './updaters';
import type { Character, StageName } from '../../types';

const eventCleanup: Array<() => void> = [];
let keyboardHandler: ((e: KeyboardEvent) => void) | null = null;

export function subscribeEvents(): void {
    const { eventSource, eventTypes } = SillyTavern.getContext();
    const state = getState();
    if (!state) return;

    const handlers = {
        onStatusChange: () => {
            debugLog('info', 'API status changed', { isReady: isApiReady() });
            updateApiStatus();
        },

        onMainApiChange: () => {
            debugLog('info', 'Main API changed', null);
            updateApiStatus();
            updateTokenEstimate();
        },

        onCharEdited: (data: { detail?: { character: Character; id: string }; character?: Character; id?: number }) => {
            const character = data.detail?.character ?? data.character;
            const id = data.detail?.id !== undefined ? parseInt(data.detail.id, 10) : data.id;
            debugLog('info', 'Character edited externally', { id, name: character?.name });
            refreshSelectedCharacter(id as number);
        },

        onCharDeleted: (data: { id: number; character: Character }) => {
            debugLog('info', 'Character deleted', { id: data.id });
            handleCharacterDeleted(data.id);
        },

        onPresetChanged: () => {
            debugLog('info', 'OAI preset changed', null);
            if (getState()) {
                updateTokenEstimate();
            }
        },

        onSourceChanged: () => {
            debugLog('info', 'Chat completion source changed', null);
            updateApiStatus();
            updateTokenEstimate();
        },

        onModelChanged: () => {
            debugLog('info', 'Chat completion model changed', null);
            updateApiStatus();
            updateTokenEstimate();
        },
    };

    eventSource.on(eventTypes.ONLINE_STATUS_CHANGED, handlers.onStatusChange);
    eventSource.on(eventTypes.MAIN_API_CHANGED, handlers.onMainApiChange);
    eventSource.on(eventTypes.CHARACTER_EDITED, handlers.onCharEdited);
    eventSource.on(eventTypes.CHARACTER_DELETED, handlers.onCharDeleted);
    eventSource.on(eventTypes.OAI_PRESET_CHANGED_AFTER, handlers.onPresetChanged);
    eventSource.on(eventTypes.CHATCOMPLETION_SOURCE_CHANGED, handlers.onSourceChanged);
    eventSource.on(eventTypes.CHATCOMPLETION_MODEL_CHANGED, handlers.onModelChanged);

    eventCleanup.push(
        () => eventSource.removeListener(eventTypes.ONLINE_STATUS_CHANGED, handlers.onStatusChange),
        () => eventSource.removeListener(eventTypes.MAIN_API_CHANGED, handlers.onMainApiChange),
        () => eventSource.removeListener(eventTypes.CHARACTER_EDITED, handlers.onCharEdited),
        () => eventSource.removeListener(eventTypes.CHARACTER_DELETED, handlers.onCharDeleted),
        () => eventSource.removeListener(eventTypes.OAI_PRESET_CHANGED_AFTER, handlers.onPresetChanged),
        () => eventSource.removeListener(eventTypes.CHATCOMPLETION_SOURCE_CHANGED, handlers.onSourceChanged),
        () => eventSource.removeListener(eventTypes.CHATCOMPLETION_MODEL_CHANGED, handlers.onModelChanged),
    );

    debugLog('info', 'Event listeners subscribed', { count: eventCleanup.length });
}

export function unsubscribeEvents(): void {
    eventCleanup.forEach(fn => fn());
    eventCleanup.length = 0;
    debugLog('info', 'Event listeners unsubscribed', null);
}

export function initGlobalListeners(
    runSingleStage: (stage: StageName) => Promise<void>,  // CHANGED: string -> StageName, void -> Promise<void>
): void {
    const state = getState();
    if (!state) return;

    keyboardHandler = (e: KeyboardEvent) => {
        const s = getState();
        if (!s) return;

        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (!s.isGenerating && !s.isRefining) {
                runSingleStage(s.activeStageView);
            }
        }

        if (e.key === 'Escape' && (s.isGenerating || s.isRefining) && s.abortController) {
            s.abortController.abort();
        }
    };

    document.addEventListener('keydown', keyboardHandler);
}

export function removeGlobalListeners(): void {
    if (keyboardHandler) {
        document.removeEventListener('keydown', keyboardHandler);
        keyboardHandler = null;
    }

    const state = getState();
    if (state) {
        // Cancel all debounced functions
        state.debouncedFunctions.forEach(fn => fn.cancel());
        state.debouncedFunctions = [];

        // Run all cleanup functions
        state.cleanupFunctions.forEach(fn => {
            try {
                fn();
            } catch (e) {
                debugLog('error', 'Cleanup function failed', e);
            }
        });
        state.cleanupFunctions = [];
    }
}

export function cleanup(): void {
    unsubscribeEvents();
    removeGlobalListeners();
    clearTokenCache();
    setState(null);
    setElement(null);
}

function refreshSelectedCharacter(editedId?: number): void {
    const state = getState();
    if (!state || state.pipeline.characterIndex === null) return;

    const { characters } = SillyTavern.getContext();
    const charList = characters as Character[];
    const index = state.pipeline.characterIndex;

    if (editedId !== undefined && editedId !== index) return;

    if (index >= 0 && index < charList.length) {
        const updatedChar = charList[index];
        if (updatedChar.name === state.pipeline.character?.name) {
            state.pipeline = { ...state.pipeline, character: updatedChar };
            updateAllComponents();
            debugLog('info', 'Character refreshed', { name: updatedChar.name });
        } else {
            handleCharacterInvalidated();
        }
    } else {
        handleCharacterInvalidated();
    }
}

function handleCharacterDeleted(deletedId: number): void {
    const state = getState();
    if (!state) return;

    const currentIndex = state.pipeline.characterIndex;
    if (currentIndex === null) return;

    if (currentIndex === deletedId) {
        handleCharacterInvalidated();
        toastr.warning('Selected character was deleted');
    } else if (currentIndex > deletedId) {
        const { characters } = SillyTavern.getContext();
        const charList = characters as Character[];
        const newIndex = currentIndex - 1;

        if (newIndex >= 0 && newIndex < charList.length) {
            state.pipeline = {
                ...state.pipeline,
                characterIndex: newIndex,
                character: charList[newIndex],
            };
            debugLog('info', 'Character index adjusted after deletion', { oldIndex: currentIndex, newIndex });
        } else {
            handleCharacterInvalidated();
        }
    }
}

function handleCharacterInvalidated(): void {
    const state = getState();
    if (!state) return;

    if (state.abortController) {
        state.abortController.abort();
    }

    debugLog('info', 'Character invalidated, clearing selection', null);

    state.pipeline = setCharacter(state.pipeline, null, null);
    state.isGenerating = false;
    state.isRefining = false;
    state.abortController = null;
    state.historyLoaded = false;
    updateAllComponents();
    toastr.info('Character selection cleared');
}
