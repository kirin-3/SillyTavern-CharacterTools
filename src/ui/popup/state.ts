// src/ui/popup/state.ts
// Centralized state management for the popup

import { createPipelineState } from '../../pipeline';
import type { PipelineState, StageName, PersistedSession } from '../../types';

// Proper type for lodash debounced functions
interface DebouncedFunction {
    (...args: unknown[]): unknown;
    cancel(): void;
    flush(): void;
}

export interface PopupState {
    pipeline: PipelineState;
    isGenerating: boolean;
    isRefining: boolean;
    abortController: AbortController | null;
    activeStageView: StageName;

    // Session management
    activeSessionId: string | null;
    sessions: PersistedSession[];
    sessionsLoaded: boolean;
    hasUnsavedChanges: boolean;
    lastSavedAt: number | null;

    // History loading state
    historyLoaded: boolean;

    // Cleanup
    debouncedFunctions: DebouncedFunction[];
    cleanupFunctions: Array<() => void>;
}

let popupState: PopupState | null = null;
let popupElement: HTMLElement | null = null;

export function getState(): PopupState | null {
    return popupState;
}

export function getElement(): HTMLElement | null {
    return popupElement;
}

export function setState(state: PopupState | null): void {
    popupState = state;
}

export function setElement(el: HTMLElement | null): void {
    popupElement = el;
}

export function createInitialState(): PopupState {
    return {
        pipeline: createPipelineState(),
        isGenerating: false,
        isRefining: false,
        abortController: null,
        activeStageView: 'score',

        // Session management
        activeSessionId: null,
        sessions: [],
        sessionsLoaded: false,
        hasUnsavedChanges: false,
        lastSavedAt: null,

        // History loading
        historyLoaded: true, // Default to true since we load on character select

        // Cleanup
        debouncedFunctions: [],
        cleanupFunctions: [],
    };
}

export function addCleanupFunction(fn: () => void): void {
    if (popupState) {
        popupState.cleanupFunctions.push(fn);
    }
}

export function updatePipeline(updater: (p: PipelineState) => PipelineState): void {
    if (popupState) {
        popupState.pipeline = updater(popupState.pipeline);
    }
}

export function markUnsavedChanges(): void {
    if (popupState) {
        popupState.hasUnsavedChanges = true;
    }
}

export function clearUnsavedChanges(): void {
    if (popupState) {
        popupState.hasUnsavedChanges = false;
        popupState.lastSavedAt = Date.now();
    }
}

export function isActive(): boolean {
    return popupState !== null && popupElement !== null;
}
