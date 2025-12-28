// src/persistence.ts
//
// Session persistence layer using localforage.
// Stores full pipeline sessions per-character with multi-session support.

import { MODULE_NAME } from './constants';
import { debugLog, logError } from './debug';
import { createStageConfigFromDefaults } from './presets';
import { getPromptPreset, getSchemaPreset } from './settings';
import type {
    Character,
    PersistedSession,
    CharacterSessionData,
    PipelineState,
    StageName,
    StageConfig,
} from './types';

// Current storage version for migrations
const STORAGE_VERSION = 2;

// ============================================================================
// KEY GENERATION
// ============================================================================

/**
 * Simple hash function for strings (djb2 algorithm)
 */
function hashString(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
}

/**
 * Generate a unique key for a character.
 */
export function getCharacterKey(character: Character): string {
    const uniqueHash = hashString(`${character.avatar}::${character.name}`);
    return `${MODULE_NAME}_sessions_${uniqueHash}`;
}

// ============================================================================
// SESSION CRUD
// ============================================================================

/**
 * Load all sessions for a character
 */
export async function loadCharacterSessions(character: Character): Promise<CharacterSessionData> {
    const { localforage } = SillyTavern.libs;
    const key = getCharacterKey(character);

    try {
        const data = await localforage.getItem(key) as CharacterSessionData | null;

        if (!data) {
            return createEmptySessionData(character);
        }

        // Migrate old format if needed
        if (!data.version || data.version < STORAGE_VERSION) {
            // Cast through unknown to satisfy TypeScript
            const migrated = migrateSessionData(data as unknown as Record<string, unknown>, character);
            await localforage.setItem(key, migrated);
            return migrated;
        }

        // Verify character match
        if (data.characterName !== character.name || data.characterAvatar !== character.avatar) {
            debugLog('info', 'Session data character mismatch, creating fresh', {
                stored: { name: data.characterName, avatar: data.characterAvatar },
                current: { name: character.name, avatar: character.avatar },
            });
            return createEmptySessionData(character);
        }

        debugLog('info', 'Loaded character sessions', {
            character: character.name,
            sessionCount: data.sessions.length,
            activeSessionId: data.activeSessionId,
        });

        return data;
    } catch (e) {
        logError('Failed to load character sessions', { key, error: e });
        return createEmptySessionData(character);
    }
}

/**
 * Save current pipeline state as a session
 */
export async function saveSession(
    character: Character,
    pipeline: PipelineState,
    sessionId?: string,
    label?: string,
): Promise<string> {
    const { localforage } = SillyTavern.libs;
    const { uuidv4 } = SillyTavern.getContext();
    const key = getCharacterKey(character);

    try {
        const data = await loadCharacterSessions(character);
        const now = Date.now();
        const id = sessionId || `session_${uuidv4()}`;

        // Find existing session for created date
        const existing = data.sessions.find(s => s.id === id);

        const session: PersistedSession = {
            id,
            label: label || existing?.label || `Session ${data.sessions.length + 1}`,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
            results: {
                score: pipeline.results.score,
                rewrite: pipeline.results.rewrite,
                analyze: pipeline.results.analyze,
            },
            configs: {
                score: pipeline.configs.score,
                rewrite: pipeline.configs.rewrite,
                analyze: pipeline.configs.analyze,
            },
            selectedStages: [...pipeline.selectedStages],
            stageStatus: { ...pipeline.stageStatus },
            iterationCount: pipeline.iterationCount,
            iterationHistory: [...pipeline.iterationHistory],
            selectedFields: { ...pipeline.selectedFields },
        };

        // Update or add
        const existingIndex = data.sessions.findIndex(s => s.id === id);
        if (existingIndex >= 0) {
            data.sessions[existingIndex] = session;
        } else {
            data.sessions.unshift(session); // New sessions at top
        }

        data.activeSessionId = id;

        await localforage.setItem(key, data);

        debugLog('info', 'Session saved', {
            character: character.name,
            sessionId: id,
            label: session.label,
            isNew: existingIndex < 0,
        });

        return id;
    } catch (e) {
        logError('Failed to save session', { character: character.name, error: e });
        throw e;
    }
}

/**
 * Get a specific session
 */
export async function getSession(
    character: Character,
    sessionId: string,
): Promise<PersistedSession | null> {
    const data = await loadCharacterSessions(character);
    return data.sessions.find(s => s.id === sessionId) || null;
}

/**
 * Rename a session
 */
export async function renameSession(
    character: Character,
    sessionId: string,
    newLabel: string,
): Promise<boolean> {
    const { localforage } = SillyTavern.libs;
    const key = getCharacterKey(character);

    try {
        const data = await loadCharacterSessions(character);
        const session = data.sessions.find(s => s.id === sessionId);

        if (!session) {
            return false;
        }

        session.label = newLabel;
        session.updatedAt = Date.now();

        await localforage.setItem(key, data);

        debugLog('info', 'Session renamed', { sessionId, newLabel });
        return true;
    } catch (e) {
        logError('Failed to rename session', { sessionId, error: e });
        return false;
    }
}

/**
 * Delete a session
 */
export async function deleteSession(
    character: Character,
    sessionId: string,
): Promise<boolean> {
    const { localforage } = SillyTavern.libs;
    const key = getCharacterKey(character);

    try {
        const data = await loadCharacterSessions(character);

        const index = data.sessions.findIndex(s => s.id === sessionId);
        if (index < 0) {
            return false;
        }

        data.sessions.splice(index, 1);

        // Update active session if we deleted it
        if (data.activeSessionId === sessionId) {
            data.activeSessionId = data.sessions[0]?.id || null;
        }

        await localforage.setItem(key, data);

        debugLog('info', 'Session deleted', {
            character: character.name,
            sessionId,
            remainingSessions: data.sessions.length,
        });

        return true;
    } catch (e) {
        logError('Failed to delete session', { sessionId, error: e });
        return false;
    }
}

/**
 * Delete all sessions for a character
 */
export async function deleteAllCharacterSessions(character: Character): Promise<number> {
    const { localforage } = SillyTavern.libs;
    const key = getCharacterKey(character);

    try {
        const data = await loadCharacterSessions(character);
        const count = data.sessions.length;

        await localforage.removeItem(key);

        debugLog('info', 'All sessions deleted for character', {
            character: character.name,
            deletedCount: count,
        });

        return count;
    } catch (e) {
        logError('Failed to delete all sessions', { character: character.name, error: e });
        return 0;
    }
}

/**
 * Set the active session ID without saving pipeline state
 */
export async function setActiveSession(
    character: Character,
    sessionId: string | null,
): Promise<void> {
    const { localforage } = SillyTavern.libs;
    const key = getCharacterKey(character);

    try {
        const data = await loadCharacterSessions(character);
        data.activeSessionId = sessionId;
        await localforage.setItem(key, data);
    } catch (e) {
        logError('Failed to set active session', { sessionId, error: e });
    }
}

// ============================================================================
// PIPELINE RESTORATION
// ============================================================================

/**
 * Restore pipeline state from a session
 */
export function restorePipelineFromSession(
    session: PersistedSession,
    character: Character,
    characterIndex: number,
): PipelineState {
    // Validate and fix configs (presets might have been deleted)
    const configs = {
        score: validateAndFixConfig('score', session.configs.score),
        rewrite: validateAndFixConfig('rewrite', session.configs.rewrite),
        analyze: validateAndFixConfig('analyze', session.configs.analyze),
    };

    return {
        character,
        characterIndex,
        results: {
            score: session.results.score,
            rewrite: session.results.rewrite,
            analyze: session.results.analyze,
        },
        configs,
        selectedStages: [...session.selectedStages],
        currentStage: null,
        stageStatus: { ...session.stageStatus },
        iterationCount: session.iterationCount,
        iterationHistory: [...session.iterationHistory],
        isRefining: session.iterationCount > 0 && !!session.results.rewrite,
        selectedFields: { ...session.selectedFields },
        exportData: null,
    };
}

/**
 * Validate a stage config and fix missing presets
 */
function validateAndFixConfig(stage: StageName, config: StageConfig): StageConfig {
    const fixed = { ...config };

    // Check if prompt preset still exists
    if (fixed.promptPresetId && !getPromptPreset(fixed.promptPresetId)) {
        debugLog('info', 'Prompt preset no longer exists, clearing reference', {
            stage,
            presetId: fixed.promptPresetId,
        });
        fixed.promptPresetId = null;
        // Keep customPrompt if it has content, otherwise use default
        if (!fixed.customPrompt?.trim()) {
            const defaults = createStageConfigFromDefaults(stage);
            fixed.promptPresetId = defaults.promptPresetId;
        }
    }

    // Check if schema preset still exists
    if (fixed.schemaPresetId && !getSchemaPreset(fixed.schemaPresetId)) {
        debugLog('info', 'Schema preset no longer exists, clearing reference', {
            stage,
            presetId: fixed.schemaPresetId,
        });
        fixed.schemaPresetId = null;
    }

    return fixed;
}

// ============================================================================
// HELPERS
// ============================================================================

function createEmptySessionData(character: Character): CharacterSessionData {
    return {
        version: STORAGE_VERSION,
        characterName: character.name,
        characterAvatar: character.avatar,
        sessions: [],
        activeSessionId: null,
    };
}

/**
 * Migrate old storage format to new
 */
function migrateSessionData(
    oldData: Record<string, unknown>,
    character: Character,
): CharacterSessionData {
    debugLog('info', 'Migrating session data', { oldVersion: (oldData.version as number | undefined) || 1 });

    // Handle v1 format (just iteration history)
    if (!oldData.version && oldData.history) {
        const history = oldData.history as PersistedSession['iterationHistory'];

        if (history.length > 0) {
            // Create a session from the old history
            const session: PersistedSession = {
                id: `migrated_${Date.now()}`,
                label: 'Migrated Session',
                createdAt: history[0]?.timestamp || Date.now(),
                updatedAt: Date.now(),
                results: { score: null, rewrite: null, analyze: null },
                configs: {
                    score: createStageConfigFromDefaults('score'),
                    rewrite: createStageConfigFromDefaults('rewrite'),
                    analyze: createStageConfigFromDefaults('analyze'),
                },
                selectedStages: ['score', 'rewrite', 'analyze'],
                stageStatus: { score: 'pending', rewrite: 'pending', analyze: 'pending' },
                iterationCount: history.length,
                iterationHistory: history,
                selectedFields: {},
            };

            return {
                version: STORAGE_VERSION,
                characterName: character.name,
                characterAvatar: character.avatar,
                sessions: [session],
                activeSessionId: session.id,
            };
        }
    }

    // Default: return empty
    return createEmptySessionData(character);
}




// ============================================================================
// GLOBAL CLEANUP
// ============================================================================

/**
 * Get all session storage keys (for debugging/cleanup)
 */
export async function getAllSessionKeys(): Promise<string[]> {
    const { localforage } = SillyTavern.libs;

    try {
        const allKeys = await localforage.keys();
        return allKeys.filter((key: string) => key.startsWith(`${MODULE_NAME}_sessions_`));
    } catch (e) {
        logError('Failed to get session keys', { error: e });
        return [];
    }
}

/**
 * Delete ALL session data for ALL characters
 */
export async function deleteAllSessions(): Promise<number> {
    const { localforage } = SillyTavern.libs;
    const keys = await getAllSessionKeys();

    let deleted = 0;
    for (const key of keys) {
        try {
            await localforage.removeItem(key);
            deleted++;
        } catch (e) {
            logError('Failed to delete session key', { key, error: e });
        }
    }

    debugLog('info', 'All sessions deleted', { deletedCount: deleted });
    return deleted;
}

/**
 * Check if a character has any saved sessions
 */
export async function hasAnySessions(character: Character): Promise<boolean> {
    const data = await loadCharacterSessions(character);
    return data.sessions.length > 0;
}

/**
 * Get session count for a character
 */
export async function getSessionCount(character: Character): Promise<number> {
    const data = await loadCharacterSessions(character);
    return data.sessions.length;
}
