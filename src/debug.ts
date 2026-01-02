// src/debug.ts
//
// Debug logging and diagnostics for the extension.

import { MODULE_NAME, MAX_DEBUG_LOG_ENTRIES, VERSION, SETTINGS_VERSION } from './constants';
import { getSettings } from './core/settings';
import { getApiStatus, getAvailableProfiles } from './core/generator';
import type { DebugLogEntry, DebugLogType, ProfileInfo } from './types';

// ============================================================================
// LOG STORAGE
// ============================================================================

const logEntries: DebugLogEntry[] = [];

// ============================================================================
// LOGGING
// ============================================================================

/**
 * Check if debug mode is enabled
 */
export function isDebugMode(): boolean {
    try {
        return getSettings().debugMode;
    } catch {
        // Settings might not be initialized yet
        return false;
    }
}

/**
 * Log a debug entry
 */
export function debugLog(type: DebugLogType, label: string, data: unknown): void {
    const entry: DebugLogEntry = {
        timestamp: new Date(),
        type,
        label,
        data,
    };

    // Always store (for later viewing even if debug mode was off)
    logEntries.unshift(entry);
    if (logEntries.length > MAX_DEBUG_LOG_ENTRIES) {
        logEntries.pop();
    }

    // Errors always log to console regardless of debug mode
    if (type === 'error') {
        console.error(`[${MODULE_NAME}:ERROR]`, label, data);
        return;
    }

    // Other types only log if debug mode is on, and use console.debug
    // so users can filter them out in browser devtools
    if (isDebugMode()) {
        const prefix = `[${MODULE_NAME}:${type.toUpperCase()}]`;
        console.debug(prefix, label, data);
    }
}

/**
 * Log an error - always outputs to console and stores in debug log.
 * Use this for errors that should never be silently swallowed.
 */
export function logError(label: string, data: unknown): void {
    debugLog('error', label, data);
}

// ============================================================================
// LOG ACCESS
// ============================================================================

/**
 * Get all debug logs
 */
export function getDebugLogs(): DebugLogEntry[] {
    return [...logEntries];
}

/**
 * Get logs filtered by type
 */
export function getDebugLogsByType(type: DebugLogType): DebugLogEntry[] {
    return logEntries.filter(e => e.type === type);
}

/**
 * Clear all debug logs
 */
export function clearDebugLogs(): void {
    logEntries.length = 0;
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format a log entry for display
 */
export function formatLogEntry(entry: DebugLogEntry): string {
    const time = entry.timestamp.toLocaleTimeString();
    const icon = {
        request: '📤',
        response: '📥',
        error: '❌',
        info: 'ℹ️',
        state: '🔄',
    }[entry.type];

    return `${icon} [${time}] ${entry.label}`;
}

/**
 * Format log data for display
 */
export function formatLogData(data: unknown): string {
    try {
        if (data === null) return 'null';
        if (data === undefined) return 'undefined';
        if (typeof data === 'string') return data;
        return JSON.stringify(data, null, 2);
    } catch {
        return String(data);
    }
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

/**
 * Collect debug info for current state
 */
export function collectDebugInfo(): Record<string, unknown> {
    const context = SillyTavern.getContext();

    // Get settings safely
    let settings;
    let settingsError: string | null = null;
    try {
        settings = getSettings();
    } catch (e) {
        settingsError = e instanceof Error ? e.message : String(e);
        settings = null;
    }

    // Get API status safely
    let apiStatus;
    let apiStatusError: string | null = null;
    try {
        apiStatus = getApiStatus();
    } catch (e) {
        apiStatusError = e instanceof Error ? e.message : String(e);
        apiStatus = null;
    }

    // Get profiles safely
    let profiles: ProfileInfo[] = [];
    let profilesError: string | null = null;
    try {
        profiles = getAvailableProfiles();
    } catch (e) {
        profilesError = e instanceof Error ? e.message : String(e);
    }

    return {
        extension: {
            version: VERSION,
            settingsVersion: SETTINGS_VERSION,
            error: settingsError,
            settings: settings ? {
                generationMode: settings.generationSettings?.mode ?? 'unknown',
                profileId: settings.generationSettings?.profileId ?? null,
                maxTokensOverride: settings.generationSettings?.maxTokensOverride ?? null,
                debugMode: settings.debugMode,
                baseSystemPromptLength: settings.baseSystemPrompt?.length ?? 0,
                userSystemPromptLength: settings.userSystemPrompt?.length ?? 0,
                baseRefinementPromptLength: settings.baseRefinementPrompt?.length ?? 0,
                userRefinementPromptLength: settings.userRefinementPrompt?.length ?? 0,
                promptPresetCount: settings.promptPresets?.length ?? 0,
                schemaPresetCount: settings.schemaPresets?.length ?? 0,
                stageDefaults: settings.stageDefaults ? {
                    score: {
                        promptPresetId: settings.stageDefaults.score?.promptPresetId,
                        useStructuredOutput: settings.stageDefaults.score?.useStructuredOutput,
                    },
                    rewrite: {
                        promptPresetId: settings.stageDefaults.rewrite?.promptPresetId,
                        useStructuredOutput: settings.stageDefaults.rewrite?.useStructuredOutput,
                    },
                    analyze: {
                        promptPresetId: settings.stageDefaults.analyze?.promptPresetId,
                        useStructuredOutput: settings.stageDefaults.analyze?.useStructuredOutput,
                    },
                } : null,
            } : null,
        },
        api: {
            error: apiStatusError,
            status: apiStatus ? {
                mode: apiStatus.mode,
                displayName: apiStatus.displayName,
                source: apiStatus.source,
                model: apiStatus.model,
                apiType: apiStatus.apiType,
                contextSize: apiStatus.contextSize,
                isReady: apiStatus.isReady,
                statusText: apiStatus.statusText,
                apiError: apiStatus.error,
            } : null,
        },
        profiles: {
            error: profilesError,
            count: profiles.length,
            list: profiles.map(p => ({
                id: p.id,
                name: p.name,
                api: p.api,
                mode: p.mode,
                model: p.model,
                isSupported: p.isSupported,
                validationError: p.validationError,
            })),
        },
        sillytavern: {
            mainApi: context.mainApi,
            onlineStatus: context.onlineStatus,
            chatCompletionSource: context.chatCompletionSettings?.chat_completion_source ?? null,
            currentModel: safeGetCurrentModel(context),
            maxContext: context.chatCompletionSettings?.openai_max_context ?? context.maxContext ?? null,
            legacyMaxContext: context.maxContext,
            characterCount: context.characters?.length ?? 0,
            hasActiveChat: !!(context.chat?.length),
            hasCMRS: !!(context.ConnectionManagerRequestService),
            hasGenerateRaw: typeof context.generateRaw === 'function',
            hasGetTokenCountAsync: typeof context.getTokenCountAsync === 'function',
            hasPresetManager: typeof context.getPresetManager === 'function',
        },
        logs: {
            total: logEntries.length,
            errors: logEntries.filter(e => e.type === 'error').length,
            recent: logEntries.slice(0, 10).map(e => ({
                type: e.type,
                label: e.label,
                time: e.timestamp.toISOString(),
            })),
        },
        environment: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            timestamp: new Date().toISOString(),
        },
    };
}

/**
 * Safely get current model from context
 */
function safeGetCurrentModel(context: ReturnType<typeof SillyTavern.getContext>): string {
    // CHANGED: Check API mode first
    if (context.mainApi === 'textgenerationwebui') {
        // Text completion - model is typically in onlineStatus
        return context.onlineStatus || 'unknown';
    }

    // Chat completion
    try {
        if (typeof context.getChatCompletionModel === 'function') {
            return context.getChatCompletionModel() || 'unknown';
        }
    } catch {
        // Fall through
    }

    // Fallback for chat completion
    try {
        const ccs = context.chatCompletionSettings;
        if (!ccs) return 'unknown';

        const source = ccs.chat_completion_source || 'unknown';
        const modelKey = source === 'makersuite' ? 'google_model' : `${source}_model`;
        return (ccs as Record<string, unknown>)[modelKey] as string || 'unknown';
    } catch {
        return 'unknown';
    }
}


/**
 * Export debug info as JSON string
 */
export function exportDebugInfo(): string {
    return JSON.stringify(collectDebugInfo(), null, 2);
}

/**
 * Generate a debug report suitable for bug reports
 */
export function generateDebugReport(): string {
    const info = collectDebugInfo();
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('CHARACTER TOOLS DEBUG REPORT');
    lines.push('='.repeat(60));
    lines.push('');

    // Extension info
    const ext = info.extension as Record<string, unknown>;
    lines.push('## Extension');
    lines.push(`Version: ${ext.version}`);
    lines.push(`Settings Version: ${ext.settingsVersion}`);
    if (ext.error) {
        lines.push(`⚠️ Settings Error: ${ext.error}`);
    }
    lines.push('');

    // API Status
    const api = info.api as Record<string, unknown>;
    lines.push('## API Status');
    if (api.error) {
        lines.push(`⚠️ API Error: ${api.error}`);
    } else if (api.status) {
        const status = api.status as Record<string, unknown>;
        lines.push(`Mode: ${status.mode}`);
        lines.push(`Source: ${status.source}`);
        lines.push(`Model: ${status.model}`);
        lines.push(`Type: ${status.apiType}`);
        lines.push(`Context: ${status.contextSize}`);
        lines.push(`Ready: ${status.isReady ? '✅ Yes' : '❌ No'}`);
        if (status.apiError) {
            lines.push(`Error: ${status.apiError}`);
        }
    }
    lines.push('');

    // Profiles
    const profilesInfo = info.profiles as Record<string, unknown>;
    lines.push('## Connection Profiles');
    if (profilesInfo.error) {
        lines.push(`⚠️ Error: ${profilesInfo.error}`);
    } else {
        lines.push(`Count: ${profilesInfo.count}`);
        const list = profilesInfo.list as Array<Record<string, unknown>>;
        if (list.length > 0) {
            for (const p of list) {
                const status = p.isSupported ? '✅' : '❌';
                lines.push(`  ${status} ${p.name} (${p.api}/${p.mode})`);
                if (p.validationError) {
                    lines.push(`      Error: ${p.validationError}`);
                }
            }
        } else {
            lines.push('  No profiles configured');
        }
    }
    lines.push('');

    // SillyTavern info
    const st = info.sillytavern as Record<string, unknown>;
    lines.push('## SillyTavern');
    lines.push(`Main API: ${st.mainApi}`);
    lines.push(`Online Status: ${st.onlineStatus}`);
    lines.push(`Chat Completion Source: ${st.chatCompletionSource}`);
    lines.push(`Current Model: ${st.currentModel}`);
    lines.push(`Context Size: ${st.maxContext} (legacy: ${st.legacyMaxContext})`);
    lines.push(`Characters: ${st.characterCount}`);
    lines.push(`Has Active Chat: ${st.hasActiveChat ? 'Yes' : 'No'}`);
    lines.push('');
    lines.push('API Availability:');
    lines.push(`  CMRS: ${st.hasCMRS ? '✅' : '❌'}`);
    lines.push(`  generateRaw: ${st.hasGenerateRaw ? '✅' : '❌'}`);
    lines.push(`  getTokenCountAsync: ${st.hasGetTokenCountAsync ? '✅' : '❌'}`);
    lines.push(`  PresetManager: ${st.hasPresetManager ? '✅' : '❌'}`);
    lines.push('');

    // Settings summary
    if (ext.settings) {
        const settings = ext.settings as Record<string, unknown>;
        lines.push('## Settings');
        lines.push(`Generation Mode: ${settings.generationMode}`);
        lines.push(`Profile ID: ${settings.profileId || '(none)'}`);
        lines.push(`Max Tokens Override: ${settings.maxTokensOverride || '(default)'}`);
        lines.push(`Debug Mode: ${settings.debugMode ? 'On' : 'Off'}`);
        lines.push(`Prompt Presets: ${settings.promptPresetCount}`);
        lines.push(`Schema Presets: ${settings.schemaPresetCount}`);
        lines.push('');
    }

    // Recent logs
    const logs = info.logs as Record<string, unknown>;
    lines.push('## Recent Logs');
    lines.push(`Total: ${logs.total} (${logs.errors} errors)`);
    const recent = logs.recent as Array<Record<string, unknown>>;
    if (recent.length > 0) {
        for (const log of recent) {
            const icon = log.type === 'error' ? '❌' : log.type === 'request' ? '📤' : log.type === 'response' ? '📥' : 'ℹ️';
            lines.push(`  ${icon} [${log.time}] ${log.label}`);
        }
    } else {
        lines.push('  No recent logs');
    }
    lines.push('');

    // Environment
    const env = info.environment as Record<string, unknown>;
    lines.push('## Environment');
    lines.push(`Generated: ${env.timestamp}`);
    lines.push(`User Agent: ${env.userAgent}`);
    lines.push('');

    lines.push('='.repeat(60));

    return lines.join('\n');
}
