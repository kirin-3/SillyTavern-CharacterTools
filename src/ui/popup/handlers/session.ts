// src/ui/popup/handlers/session.ts
// Session management handlers

import { MODULE_NAME } from '../../../constants';
import { debugLog } from '../../../debug';
import {
    loadCharacterSessions,
    saveSession,
    deleteSession,
    deleteAllCharacterSessions,
    renameSession,
    restorePipelineFromSession,
    setActiveSession,
} from '../../../persistence';
import { createPipelineState, initializeFieldSelection } from '../../../pipeline';
import { getState, getElement, clearUnsavedChanges, markUnsavedChanges } from '../state';
import { updateAllComponents, updateSessionManager } from '../updaters';

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initSessionManagerListeners(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const container = el.querySelector(`#${MODULE_NAME}_session_manager`);
    if (!container) return;

    container.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const s = getState();
        if (!s) return;

        // Save session
        if (target.closest(`#${MODULE_NAME}_save_session_btn`)) {
            await handleSaveSession();
            return;
        }

        // New session
        if (target.closest(`#${MODULE_NAME}_new_session_btn`)) {
            await handleNewSession();
            return;
        }

        // Clear all sessions
        if (target.closest(`#${MODULE_NAME}_clear_all_sessions_btn`)) {
            await handleClearAllSessions();
            return;
        }

        // Load session
        const loadBtn = target.closest(`.${MODULE_NAME}_session_load_btn`);
        if (loadBtn) {
            const sessionId = loadBtn.getAttribute('data-session-id');
            if (sessionId) {
                await handleLoadSession(sessionId);
            }
            return;
        }

        // Rename session
        const renameBtn = target.closest(`.${MODULE_NAME}_session_rename_btn`);
        if (renameBtn) {
            const sessionId = renameBtn.getAttribute('data-session-id');
            if (sessionId) {
                await handleRenameSession(sessionId);
            }
            return;
        }

        // Delete session
        const deleteBtn = target.closest(`.${MODULE_NAME}_session_delete_btn`);
        if (deleteBtn) {
            const sessionId = deleteBtn.getAttribute('data-session-id');
            if (sessionId) {
                await handleDeleteSession(sessionId);
            }
            return;
        }
    });
}

// ============================================================================
// HANDLERS
// ============================================================================

export async function handleSaveSession(label?: string): Promise<void> {
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

        state.activeSessionId = sessionId;
        clearUnsavedChanges();

        // Reload sessions list
        const data = await loadCharacterSessions(state.pipeline.character);
        state.sessions = data.sessions;

        updateSessionManager();
        toastr.success('Session saved');
    } catch (err) {
        toastr.error('Failed to save session');
        debugLog('error', 'Save session failed', err);
    }
}

export async function handleNewSession(): Promise<void> {
    const state = getState();
    if (!state?.pipeline.character) return;

    const { Popup, POPUP_RESULT } = SillyTavern.getContext();

    // Check for unsaved changes
    if (state.hasUnsavedChanges) {
        const save = await Popup.show.confirm(
            'Unsaved Changes',
            'You have unsaved changes. Save before starting a new session?',
        );

        if (save === POPUP_RESULT.AFFIRMATIVE) {
            await handleSaveSession();
        }
    }

    // Get label for new session
    const label = await Popup.show.input(
        'New Session',
        'Enter a name for this session:',
        `Session ${state.sessions.length + 1}`,
    );

    if (label === null || label === POPUP_RESULT.CANCELLED) return;

    // Create fresh pipeline but keep character
    const character = state.pipeline.character;
    const characterIndex = state.pipeline.characterIndex;

    state.pipeline = createPipelineState();
    state.pipeline.character = character;
    state.pipeline.characterIndex = characterIndex;
    state.pipeline.selectedFields = initializeFieldSelection(character);

    // Save immediately
    try {
        const sessionId = await saveSession(
            character,
            state.pipeline,
            undefined,
            typeof label === 'string' ? label.trim() || undefined : undefined,
        );

        state.activeSessionId = sessionId;
        clearUnsavedChanges();

        // Reload sessions
        const data = await loadCharacterSessions(character);
        state.sessions = data.sessions;

        updateAllComponents();
        toastr.success('New session created');
    } catch (err) {
        toastr.error('Failed to create session');
        debugLog('error', 'Create session failed', err);
    }
}

export async function handleLoadSession(sessionId: string): Promise<void> {
    const state = getState();
    if (!state?.pipeline.character) return;

    // Capture character reference early
    const character = state.pipeline.character;

    const { Popup, POPUP_RESULT } = SillyTavern.getContext();

    // Check for unsaved changes
    if (state.hasUnsavedChanges) {
        const save = await Popup.show.confirm(
            'Unsaved Changes',
            'You have unsaved changes. Save before loading another session?',
        );

        if (save === POPUP_RESULT.AFFIRMATIVE) {
            await handleSaveSession();
        } else if (save === POPUP_RESULT.CANCELLED) {
            return;
        }
    }

    const session = state.sessions.find(s => s.id === sessionId);
    if (!session) {
        toastr.error('Session not found');
        return;
    }

    // Restore pipeline from session
    state.pipeline = restorePipelineFromSession(
        session,
        character,
        state.pipeline.characterIndex!,
    );

    state.activeSessionId = sessionId;
    clearUnsavedChanges();

    // Update active session in storage - use captured character
    await setActiveSession(character, sessionId);

    updateAllComponents();
    toastr.success(`Loaded: ${session.label}`);
}


export async function handleRenameSession(sessionId: string): Promise<void> {
    const state = getState();
    if (!state?.pipeline.character) return;

    const { Popup, POPUP_RESULT } = SillyTavern.getContext();

    const session = state.sessions.find(s => s.id === sessionId);
    if (!session) return;

    const newLabel = await Popup.show.input(
        'Rename Session',
        'Enter a new name:',
        session.label,
    );

    if (newLabel === null || newLabel === POPUP_RESULT.CANCELLED) return;
    if (typeof newLabel !== 'string' || !newLabel.trim()) return;

    const success = await renameSession(state.pipeline.character, sessionId, newLabel.trim());

    if (success) {
        // Reload sessions
        const data = await loadCharacterSessions(state.pipeline.character);
        state.sessions = data.sessions;
        updateSessionManager();
        toastr.success('Session renamed');
    } else {
        toastr.error('Failed to rename session');
    }
}

export async function handleDeleteSession(sessionId: string): Promise<void> {
    const state = getState();
    if (!state?.pipeline.character) return;

    const { Popup, POPUP_RESULT } = SillyTavern.getContext();

    const session = state.sessions.find(s => s.id === sessionId);
    if (!session) return;

    const confirmed = await Popup.show.confirm(
        'Delete Session?',
        `Delete "${session.label}"? This cannot be undone.`,
    );

    if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;

    const wasActive = sessionId === state.activeSessionId;
    const success = await deleteSession(state.pipeline.character, sessionId);

    if (success) {
        // Reload sessions
        const data = await loadCharacterSessions(state.pipeline.character);
        state.sessions = data.sessions;
        state.activeSessionId = data.activeSessionId;

        // If we deleted the active session, load the new active one or reset
        if (wasActive) {
            if (data.activeSessionId && data.sessions.length > 0) {
                const newActive = data.sessions.find(s => s.id === data.activeSessionId);
                if (newActive && state.pipeline.character) {
                    state.pipeline = restorePipelineFromSession(
                        newActive,
                        state.pipeline.character,
                        state.pipeline.characterIndex!,
                    );
                }
            } else if (state.pipeline.character) {
                // No sessions left, reset pipeline
                const character = state.pipeline.character;
                const characterIndex = state.pipeline.characterIndex;
                state.pipeline = createPipelineState();
                state.pipeline.character = character;
                state.pipeline.characterIndex = characterIndex;
                state.pipeline.selectedFields = initializeFieldSelection(character);
            }
            clearUnsavedChanges();
        }

        updateAllComponents();
        toastr.success('Session deleted');
    } else {
        toastr.error('Failed to delete session');
    }
}

export async function handleClearAllSessions(): Promise<void> {
    const state = getState();
    if (!state?.pipeline.character) return;

    // Capture character reference - TypeScript now knows it's non-null
    const character = state.pipeline.character;

    const { Popup, POPUP_RESULT } = SillyTavern.getContext();

    const confirmed = await Popup.show.confirm(
        'Clear All Sessions?',
        `Delete ALL sessions for ${character.name}? This cannot be undone.`,
    );

    if (confirmed !== POPUP_RESULT.AFFIRMATIVE) return;

    const count = await deleteAllCharacterSessions(character);

    // Reset state
    state.sessions = [];
    state.activeSessionId = null;

    // Reset pipeline but keep character
    const characterIndex = state.pipeline.characterIndex;
    state.pipeline = createPipelineState();
    state.pipeline.character = character;
    state.pipeline.characterIndex = characterIndex;
    state.pipeline.selectedFields = initializeFieldSelection(character);
    clearUnsavedChanges();

    updateAllComponents();
    toastr.success(`Deleted ${count} session(s)`);
}


// ============================================================================
// AUTO-SAVE
// ============================================================================

let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule an auto-save (debounced)
 */
export function scheduleAutoSave(): void {
    const state = getState();
    if (!state?.pipeline.character) return;

    // Mark as having unsaved changes
    markUnsavedChanges();
    updateSessionManager();

    // Clear existing timeout
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }

    // Schedule save in 10 seconds
    autoSaveTimeout = setTimeout(async () => {
        const currentState = getState();
        if (!currentState?.pipeline.character || !currentState.hasUnsavedChanges) return;

        const character = currentState.pipeline.character;

        // Only auto-save if there's meaningful content
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

                // Get the session ID that was saved
                const data = await loadCharacterSessions(character);
                currentState.activeSessionId = data.activeSessionId;

                clearUnsavedChanges();
                currentState.sessions = data.sessions;

                updateSessionManager();
                debugLog('info', 'Auto-saved session', { sessionId: currentState.activeSessionId });
            } catch (err) {
                debugLog('error', 'Auto-save failed', err);
            }
        }
    }, 10000); // 10 second debounce
}

/**
 * Cancel pending auto-save
 */
export function cancelAutoSave(): void {
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
    }
}

/**
 * Force immediate save (for popup close)
 */
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
