// src/core/character.ts
//
// Character utilities - field extraction, formatting, token counting.

import { CHARACTER_FIELDS } from '../constants';
import { getTokenCount, getTokenCountsKeyed, getContentTokenEstimate } from './tokens';
import type { Character, CharacterField, PopulatedField, DepthPrompt, CharacterBook, FieldSelection } from '../types';
import type { TokenEstimate } from './tokens';

// ============================================================================
// FIELD VALUE EXTRACTION
// ============================================================================

/**
 * Get a value from a character using a dot-notation path.
 * Supports paths like 'data.system_prompt' or 'data.extensions.depth_prompt'
 */
function getValueByPath(obj: Character, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }

    return current;
}

/**
 * Check if a value is non-empty and usable
 */
function isPopulatedValue(value: unknown, type: CharacterField['type']): boolean {
    if (value === null || value === undefined) {
        return false;
    }

    switch (type) {
        case 'array':
            return Array.isArray(value) && value.length > 0;

        case 'object':
            if (typeof value !== 'object') return false;
            if ('prompt' in value && typeof (value as DepthPrompt).prompt === 'string') {
                return (value as DepthPrompt).prompt.trim().length > 0;
            }
            if ('entries' in value && Array.isArray((value as CharacterBook).entries)) {
                return (value as CharacterBook).entries.length > 0;
            }
            return Object.keys(value).length > 0;

        case 'string':
        default:
            return typeof value === 'string' && value.trim().length > 0;
    }
}

/**
 * Get field value from character. Single path lookup, no fallbacks needed.
 */
function getFieldValue(char: Character, field: CharacterField): unknown {
    const value = getValueByPath(char, field.path);
    return isPopulatedValue(value, field.type || 'string') ? value : undefined;
}

/**
 * Format a field value as a string for display/prompts
 */
function formatFieldValue(value: unknown, field: CharacterField): string {
    const type = field.type || 'string';

    switch (type) {
        case 'array':
            if (!Array.isArray(value)) return '';
            return value
                .map((item, i) => `${i + 1}. ${String(item).trim()}`)
                .join('\n');

        case 'object':
            return formatObjectField(value, field.key);

        case 'string':
        default:
            return typeof value === 'string' ? value.trim() : String(value);
    }
}

/**
 * Format special object fields
 */
function formatObjectField(value: unknown, key: string): string {
    if (!value || typeof value !== 'object') return '';

    switch (key) {
        case 'depth_prompt': {
            const dp = value as DepthPrompt;
            if (!dp.prompt?.trim()) return '';
            return `[Depth: ${dp.depth}, Role: ${dp.role}]\n${dp.prompt.trim()}`;
        }

        case 'character_book': {
            const book = value as CharacterBook;
            if (!book.entries?.length) return '';

            const lines: string[] = [];
            if (book.name) lines.push(`Lorebook: ${book.name}`);
            lines.push(`Entries: ${book.entries.length}`, '');

            for (const entry of book.entries) {
                const status = entry.enabled ? '✓' : '✗';
                const keys = entry.keys.slice(0, 5).join(', ');
                const keysSuffix = entry.keys.length > 5 ? ` (+${entry.keys.length - 5} more)` : '';
                const comment = entry.comment || `Entry ${entry.id}`;
                lines.push(`${status} ${comment}: [${keys}${keysSuffix}]`);

                if (entry.content) {
                    const preview = entry.content.trim().substring(0, 100);
                    const suffix = entry.content.length > 100 ? '...' : '';
                    lines.push(`   ${preview}${suffix}`);
                }
            }

            return lines.join('\n');
        }

        default:
            try {
                return JSON.stringify(value, null, 2);
            } catch {
                return '[Complex Object]';
            }
    }
}

// ============================================================================
// FIELD EXTRACTION
// ============================================================================

/**
 * Get all populated fields from a character
 */
export function getPopulatedFields(char: Character): PopulatedField[] {
    if (!char?.data) return [];

    const populated: PopulatedField[] = [];

    for (const field of CHARACTER_FIELDS) {
        const value = getFieldValue(char, field);
        if (value === undefined) continue;

        const formatted = formatFieldValue(value, field);
        if (!formatted) continue;

        populated.push({
            key: field.key,
            label: field.label,
            value: formatted,
            rawValue: value,
            charCount: formatted.length,
            type: field.type,
        });
    }

    return populated;
}

/**
 * Get total character count across all fields
 */
export function getTotalCharCount(char: Character): number {
    return getPopulatedFields(char).reduce((sum, f) => sum + f.charCount, 0);
}

/**
 * Get count of populated fields
 */
export function getPopulatedFieldCount(char: Character): number {
    return getPopulatedFields(char).length;
}

// ============================================================================
// TOKEN COUNTING
// ============================================================================

/**
 * Get token count for selected fields
 */
export async function getSelectedFieldsTokenCount(
    char: Character,
    selection: FieldSelection,
): Promise<number | null> {
    const summary = buildCharacterSummaryFromSelection(char, selection);
    return await getTokenCount(summary);
}

/**
 * Get token count for all populated fields
 */
export async function getTotalTokenCount(char: Character): Promise<number | null> {
    const summary = buildCharacterSummary(char);
    return await getTokenCount(summary);
}

/**
 * Get token estimate with context info for character content
 */
export async function getCharacterTokenEstimate(char: Character): Promise<TokenEstimate | null> {
    const summary = buildCharacterSummary(char);
    return await getContentTokenEstimate(summary);
}

/**
 * Get token counts per field (for display)
 */
export async function getFieldTokenCounts(char: Character): Promise<Map<string, number>> {
    const fields = getPopulatedFields(char);
    const items = fields.map(f => ({ key: f.key, text: f.value }));
    const results = await getTokenCountsKeyed(items);

    const counts = new Map<string, number>();
    for (const { key, tokens } of results) {
        if (tokens !== null) {
            counts.set(key, tokens);
        }
    }

    return counts;
}

// Add this function to escape ST macros before they hit generateRaw
// ============================================================================
// MACRO HANDLING
// ============================================================================

/**
 * Escape ST macros in text so they pass through generateRaw unchanged.
 * We handle {{char}} ourselves; {{user}} should pass through as literal text.
 */
export function escapeSTMacros(text: string, charName: string): string {
    // First, replace {{char}} with the actual character name (the one we're analyzing)
    let result = text.replace(/\{\{char\}\}/gi, charName);

    // Escape {{user}} so ST doesn't replace it with the active persona
    // Use a zero-width space to break the macro pattern
    result = result.replace(/\{\{user\}\}/gi, '{{u\u200Bser}}');

    // Also escape other common macros that might cause issues
    result = result.replace(/\{\{persona\}\}/gi, '{{pers\u200Bona}}');
    result = result.replace(/\{\{original\}\}/gi, '{{orig\u200Binal}}');

    return result;
}

/**
 * For display purposes: replace {{char}} with character name,
 * leave {{user}} visible as-is (it's part of the card content)
 */
export function replaceCharMacroForDisplay(text: string, charName: string): string {
    return text.replace(/\{\{char\}\}/gi, charName);
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Build a formatted character summary for prompts (all fields)
 */
export function buildCharacterSummary(char: Character): string {
    const fields = getPopulatedFields(char);
    const sections = fields.map(f => `### ${f.label}\n${f.value}`);
    const result = `# CHARACTER: ${char.name}\n\n${sections.join('\n\n')}`;

    // CHANGED: Escape ST macros
    return escapeSTMacros(result, char.name);
}

/**
 * Build character summary using only selected fields.
 * Escapes ST macros so generateRaw doesn't mangle them.
 */
export function buildCharacterSummaryFromSelection(
    char: Character,
    selection: FieldSelection,
): string {
    const sections: string[] = [];
    const allFields = getPopulatedFields(char);

    for (const field of allFields) {
        const selected = selection[field.key];
        if (!selected) continue;
        if (Array.isArray(selected) && selected.length === 0) continue;

        if (field.key === 'alternate_greetings' && Array.isArray(selected)) {
            const greetings = field.rawValue as string[];
            const selectedGreetings = (selected as number[])
                .filter(i => i >= 0 && i < greetings.length)
                .map(i => `**Greeting ${i + 1}:**\n${greetings[i].trim()}`)
                .join('\n\n');

            if (selectedGreetings) {
                sections.push(`### ${field.label}\n\n${selectedGreetings}`);
            }
        } else {
            sections.push(`### ${field.label}\n\n${field.value}`);
        }
    }

    const result = sections.length === 0
        ? `# CHARACTER: ${char.name}\n\n(No fields selected)`
        : `# CHARACTER: ${char.name}\n\n${sections.join('\n\n')}`;

    // CHANGED: Escape ST macros so generateRaw doesn't replace them
    return escapeSTMacros(result, char.name);
}

/**
 * Build a compact character summary (for display)
 */
export function buildCompactSummary(char: Character): string {
    const fields = getPopulatedFields(char);
    return `${char.name} - ${fields.length} fields, ${getTotalCharCount(char).toLocaleString()} chars`;
}

/**
 * Get a preview of a field value (truncated)
 */
export function getFieldPreview(value: string, maxLength = 100): string {
    return value.length <= maxLength ? value : value.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a character has enough content to analyze
 */
export function hasAnalyzableContent(char: Character): boolean {
    return getPopulatedFields(char).length > 0;
}

/**
 * Get validation issues with a character
 */
export function validateCharacter(char: Character): string[] {
    const issues: string[] = [];

    if (!char) {
        issues.push('No character provided');
        return issues;
    }

    if (!char.name?.trim()) {
        issues.push('Character has no name');
    }

    if (!char.data) {
        issues.push('Character has no data object');
        return issues;
    }

    if (getPopulatedFields(char).length === 0) {
        issues.push('Character has no populated fields');
    }

    return issues;
}

// ============================================================================
// SEARCH
// ============================================================================

/**
 * Prepare character data for fuzzy search
 */
export function prepareForSearch(chars: Character[]): Array<{ char: Character; index: number; searchText: string }> {
    return chars
        .filter(char => char?.name && char?.data)
        .map((char, index) => ({
            char,
            index,
            searchText: [
                char.name,
                char.data!.description?.substring(0, 200),
                char.data!.personality?.substring(0, 100),
            ].filter(Boolean).join(' ').toLowerCase(),
        }));
}
