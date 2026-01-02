// src/ui/popup/state.ts
// Centralized state management for the popup

import { createPipelineState } from '../../core/pipeline';
import type { PipelineState, StageName, PersistedSession, Character, SchemaValidationResult } from '../../types';

// ============================================================================
// TYPES
// ============================================================================

export interface SearchState {
    query: string;
    results: Array<{ char: Character; index: number }>;
    selectedIndex: number;
}

// Re-export for convenience (but canonical definition is in types.ts)
export type { SchemaValidationResult } from '../../types';

export interface PopupState {
    pipeline: PipelineState;
    isGenerating: boolean;
    isRefining: boolean;
    activeStageView: StageName;

    // Session management
    activeSessionId: string | null;
    sessions: PersistedSession[];
    sessionsLoaded: boolean;
    hasUnsavedChanges: boolean;
    lastSavedAt: number | null;
    sessionListExpanded: boolean;

    // History loading state
    historyLoaded: boolean;

    // Search state
    searchState: SearchState;

    // Schema validation cache (token cache moved to core/tokens.ts)
    schemaValidationCache: Map<string, SchemaValidationResult>;
}

// ============================================================================
// MODULE STATE
// ============================================================================

let popupState: PopupState | null = null;
let popupElement: HTMLElement | null = null;

// Cleanup functions registered by various modules
const cleanupFunctions: Array<() => void> = [];

// ============================================================================
// CORE ACCESSORS
// ============================================================================

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

export function isActive(): boolean {
    return popupState !== null && popupElement !== null;
}

// ============================================================================
// STATE CREATION
// ============================================================================

export function createInitialState(): PopupState {
    return {
        pipeline: createPipelineState(),
        isGenerating: false,
        isRefining: false,
        activeStageView: 'score',

        // Session management
        activeSessionId: null,
        sessions: [],
        sessionsLoaded: false,
        hasUnsavedChanges: false,
        lastSavedAt: null,
        sessionListExpanded: false,

        // History loading
        historyLoaded: true,

        // Search state
        searchState: {
            query: '',
            results: [],
            selectedIndex: -1,
        },

        // Caches
        schemaValidationCache: new Map(),
    };
}

// ============================================================================
// IMMUTABLE STATE UPDATE
// ============================================================================

/**
 * Update state immutably. Updater receives current state and returns partial update.
 */
export function updateState(updater: (s: PopupState) => Partial<PopupState>): void {
    if (!popupState) return;
    const updates = updater(popupState);
    popupState = { ...popupState, ...updates };
}

// ============================================================================
// PIPELINE UPDATE HELPER
// ============================================================================

export function updatePipeline(updater: (p: PipelineState) => PipelineState): void {
    if (popupState) {
        popupState = {
            ...popupState,
            pipeline: updater(popupState.pipeline),
        };
    }
}

// ============================================================================
// UNSAVED CHANGES TRACKING
// ============================================================================

export function markUnsavedChanges(): void {
    if (popupState) {
        popupState = { ...popupState, hasUnsavedChanges: true };
    }
}

export function clearUnsavedChanges(): void {
    if (popupState) {
        popupState = {
            ...popupState,
            hasUnsavedChanges: false,
            lastSavedAt: Date.now(),
        };
    }
}

// ============================================================================
// SCHEMA VALIDATION CACHE
// ============================================================================

/**
 * Get cached schema validation result, or null if not cached.
 */
export function getSchemaValidationFromCache(content: string): SchemaValidationResult | null {
    if (!popupState) return null;
    return popupState.schemaValidationCache.get(content) ?? null;
}

/**
 * Cache a schema validation result.
 */
export function setSchemaValidationInCache(content: string, result: SchemaValidationResult): void {
    if (!popupState) return;
    popupState.schemaValidationCache.set(content, result);
}

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

/**
 * Register a cleanup function to be called when popup closes.
 */
export function addCleanupFunction(fn: () => void): void {
    cleanupFunctions.push(fn);
}

/**
 * Run all registered cleanup functions.
 */
export function runCleanupFunctions(): void {
    cleanupFunctions.forEach(fn => {
        try {
            fn();
        } catch {
            // Ignore cleanup errors
        }
    });
    cleanupFunctions.length = 0;
}

// ============================================================================
// CACHE RESET
// ============================================================================

/**
 * Reset all caches. Call when popup closes to free memory.
 */
export function resetAllCaches(): void {
    if (popupState) {
        popupState.schemaValidationCache.clear();
        popupState.searchState = {
            query: '',
            results: [],
            selectedIndex: -1,
        };
    }
}
