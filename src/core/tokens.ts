// src/core/tokens.ts
//
// Centralized token counting with debounce, caching, and batch support.

import { debugLog } from '../debug';
import { getApiStatus } from './generator';

// ============================================================================
// TYPES
// ============================================================================

type TokenCallback = (tokens: number | null) => void;

interface PendingRequest {
    text: string;
    callbacks: TokenCallback[];
    timeoutId: ReturnType<typeof setTimeout>;
}

export interface TokenEstimate {
    promptTokens: number;
    contextSize: number;
    maxOutput: number;
    percentage: number;
}

export interface FieldTokenResult {
    key: string;
    tokens: number | null;
}

// ============================================================================
// STATE
// ============================================================================

const cache = new Map<string, number>();
const pending = new Map<string, PendingRequest>();

const DEBOUNCE_MS = 300;
const CACHE_MAX_SIZE = 500;

// ============================================================================
// CACHE KEY GENERATION
// ============================================================================

/**
 * Generate cache key from text using hash + length + bookends.
 * More efficient than storing full text as key for large prompts.
 */
function getCacheKey(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    const prefix = text.slice(0, 16);
    const suffix = text.slice(-16);
    return `${hash}_${text.length}_${prefix}_${suffix}`;
}

// ============================================================================
// CORE - CALLBACK API (for UI with debounce)
// ============================================================================

/**
 * Get token count for text. Debounced, cached, async.
 *
 * @param text - Text to count
 * @param callback - Called with token count (or null if unavailable)
 * @param immediate - Skip debounce (for final values)
 */
export function countTokens(
    text: string,
    callback: TokenCallback,
    immediate = false,
): void {
    const trimmed = text.trim();

    if (!trimmed) {
        callback(0);
        return;
    }

    const key = getCacheKey(trimmed);

    // Check cache
    const cached = cache.get(key);
    if (cached !== undefined) {
        callback(cached);
        return;
    }

    // Check pending
    const existingPending = pending.get(key);
    if (existingPending) {
        existingPending.callbacks.push(callback);
        return;
    }

    // Create pending request
    const request: PendingRequest = {
        text: trimmed,
        callbacks: [callback],
        timeoutId: setTimeout(
            () => executeCount(key, trimmed),
            immediate ? 0 : DEBOUNCE_MS,
        ),
    };

    pending.set(key, request);
}

/**
 * Cancel pending count for specific text
 */
export function cancelCount(text: string): void {
    const key = getCacheKey(text.trim());
    const request = pending.get(key);
    if (request) {
        clearTimeout(request.timeoutId);
        pending.delete(key);
    }
}

/**
 * Cancel all pending counts
 */
export function cancelAllCounts(): void {
    for (const request of pending.values()) {
        clearTimeout(request.timeoutId);
    }
    pending.clear();
}

/**
 * Clear cache (call on API/tokenizer change)
 */
export function clearTokenCache(): void {
    cache.clear();
    debugLog('info', 'Token cache cleared', null);
}

// ============================================================================
// CORE - PROMISE API
// ============================================================================

/**
 * Get token count for text (Promise-based).
 * Uses cache, no debounce.
 */
export async function getTokenCount(text: string): Promise<number | null> {
    const trimmed = text.trim();
    if (!trimmed) return 0;

    const key = getCacheKey(trimmed);

    // Check cache
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    // Execute immediately
    const ctx = SillyTavern.getContext();
    if (typeof ctx.getTokenCountAsync !== 'function') {
        return null;
    }

    try {
        const tokens = await ctx.getTokenCountAsync(trimmed);
        setCacheValue(key, tokens);
        return tokens;
    } catch (e) {
        debugLog('error', 'Token count failed', e);
        return null;
    }
}

/**
 * Get token counts for multiple texts (batch).
 * Returns Map of text -> count.
 */
export async function getTokenCountBatch(
    texts: string[],
): Promise<Map<string, number | null>> {
    const results = new Map<string, number | null>();
    const uncached: Array<{ text: string; key: string; original: string }> = [];

    // Check cache first
    for (const text of texts) {
        const trimmed = text.trim();
        if (!trimmed) {
            results.set(text, 0);
            continue;
        }

        const key = getCacheKey(trimmed);
        const cached = cache.get(key);
        if (cached !== undefined) {
            results.set(text, cached);
        } else {
            uncached.push({ text: trimmed, key, original: text });
        }
    }

    // Fetch uncached in parallel
    if (uncached.length > 0) {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.getTokenCountAsync !== 'function') {
            for (const { original } of uncached) {
                results.set(original, null);
            }
            return results;
        }

        const promises = uncached.map(async ({ text, key, original }) => {
            try {
                const tokens = await ctx.getTokenCountAsync(text);
                setCacheValue(key, tokens);
                return { original, tokens };
            } catch {
                return { original, tokens: null };
            }
        });

        const batchResults = await Promise.all(promises);
        for (const { original, tokens } of batchResults) {
            results.set(original, tokens);
        }
    }

    return results;
}

/**
 * Get token counts for keyed items (e.g., character fields).
 * Returns array with original keys preserved.
 */
export async function getTokenCountsKeyed(
    items: Array<{ key: string; text: string }>,
): Promise<FieldTokenResult[]> {
    const texts = items.map(i => i.text);
    const counts = await getTokenCountBatch(texts);

    return items.map(item => ({
        key: item.key,
        tokens: counts.get(item.text) ?? null,
    }));
}

// ============================================================================
// PROMPT ESTIMATION
// ============================================================================

/**
 * Get token estimate for a prompt with context info.
 * Used for stage/refinement token displays.
 */
export async function getPromptTokenEstimate(
    userPrompt: string,
    systemPrompt: string,
): Promise<TokenEstimate | null> {
    const fullPrompt = systemPrompt + '\n\n' + userPrompt;
    const promptTokens = await getTokenCount(fullPrompt);

    if (promptTokens === null) return null;

    const status = getApiStatus();

    return {
        promptTokens,
        contextSize: status.contextSize,
        maxOutput: status.maxOutput,
        percentage: Math.round((promptTokens / status.contextSize) * 100),
    };
}

/**
 * Get token estimate for combined content (e.g., character summary).
 * Simpler than getPromptTokenEstimate - just returns count + limits.
 */
export async function getContentTokenEstimate(
    content: string,
): Promise<TokenEstimate | null> {
    const tokens = await getTokenCount(content);
    if (tokens === null) return null;

    const status = getApiStatus();

    return {
        promptTokens: tokens,
        contextSize: status.contextSize,
        maxOutput: status.maxOutput,
        percentage: Math.round((tokens / status.contextSize) * 100),
    };
}

// ============================================================================
// SYNC HELPERS
// ============================================================================

/**
 * Get cached token count if available (no API call)
 */
export function getCachedTokenCount(text: string): number | null {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    const key = getCacheKey(trimmed);
    return cache.get(key) ?? null;
}

/**
 * Check if a count is pending for this text
 */
export function isCountPending(text: string): boolean {
    const key = getCacheKey(text.trim());
    return pending.has(key);
}

/**
 * Manually set a cache value (for external caching needs)
 */
export function setCachedTokenCount(text: string, count: number): void {
    const key = getCacheKey(text.trim());
    setCacheValue(key, count);
}

/**
 * Get current cache size (for debugging)
 */
export function getCacheSize(): number {
    return cache.size;
}

/**
 * Get pending request count (for debugging)
 */
export function getPendingCount(): number {
    return pending.size;
}

// ============================================================================
// INTERNAL
// ============================================================================

function setCacheValue(key: string, tokens: number): void {
    if (cache.size >= CACHE_MAX_SIZE) {
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
    }
    cache.set(key, tokens);
}

async function executeCount(key: string, text: string): Promise<void> {
    const request = pending.get(key);
    if (!request) return;

    pending.delete(key);

    const ctx = SillyTavern.getContext();

    if (typeof ctx.getTokenCountAsync !== 'function') {
        debugLog('info', 'Token counting not available', null);
        for (const cb of request.callbacks) {
            cb(null);
        }
        return;
    }

    try {
        const tokens = await ctx.getTokenCountAsync(text);
        setCacheValue(key, tokens);

        for (const cb of request.callbacks) {
            cb(tokens);
        }
    } catch (e) {
        debugLog('error', 'Token count failed', e);
        for (const cb of request.callbacks) {
            cb(null);
        }
    }
}
