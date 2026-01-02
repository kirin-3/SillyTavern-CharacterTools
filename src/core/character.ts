// src/core/character.ts
//
// Character utilities - field extraction, formatting, token counting.

import { CHARACTER_FIELDS } from '../constants';
import { getTokenCount } from './generator';
import type { Character, CharacterField, PopulatedField, DepthPrompt, CharacterBook, FieldSelection } from '../types';

// ============================================================================
// FIELD VALUE EXTRACTION
// ============================================================================

/**
 * Fields that can exist at both top-level AND in data.*
 * Maps field key to top-level property name
 */
const TOP_LEVEL_FALLBACKS: Record<string, string> = {
    system_prompt: 'system_prompt',
    post_history_instructions: 'post_history_instructions',
    creator_notes: 'creator_notes',
};

/**
 * Legacy field name mappings (old field name -> current field key)
 */
const LEGACY_FIELD_NAMES: Record<string, string> = {
    creator_notes: 'creatorcomment',
};

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
            // For depth_prompt, check if prompt has content
            if ('prompt' in value && typeof (value as DepthPrompt).prompt === 'string') {
                return (value as DepthPrompt).prompt.trim().length > 0;
            }
            // For character_book, check if entries exist
            if ('entries' in value && Array.isArray((value as CharacterBook).entries)) {
                return (value as CharacterBook).entries.length > 0;
            }
            // Generic object - has any keys
            return Object.keys(value).length > 0;

        case 'string':
        default:
            return typeof value === 'string' && value.trim().length > 0;
    }
}

/**
 * Format a field value as a string for display/prompts
 */
function formatFieldValue(value: unknown, field: CharacterField): string {
    const type = field.type || 'string';

    switch (type) {
        case 'array':
            if (!Array.isArray(value)) return '';
            // Format as numbered list
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
            if (book.name) {
                lines.push(`Lorebook: ${book.name}`);
            }
            lines.push(`Entries: ${book.entries.length}`);
            lines.push('');

            // List entries with keywords
            for (const entry of book.entries) {
                const status = entry.enabled ? '✓' : '✗';
                const keys = entry.keys.slice(0, 5).join(', ');
                const keysSuffix = entry.keys.length > 5 ? ` (+${entry.keys.length - 5} more)` : '';
                const comment = entry.comment || `Entry ${entry.id}`;
                lines.push(`${status} ${comment}: [${keys}${keysSuffix}]`);

                // Include content preview (first 100 chars)
                if (entry.content) {
                    const preview = entry.content.trim().substring(0, 100);
                    const suffix = entry.content.length > 100 ? '...' : '';
                    lines.push(`   ${preview}${suffix}`);
                }
            }

            return lines.join('\n');
        }

        default:
            // Generic object - JSON stringify
            try {
                return JSON.stringify(value, null, 2);
            } catch {
                return '[Complex Object]';
            }
    }
}

/**
 * Try to get a field value, checking multiple possible locations.
 * Order: primary path -> top-level fallback -> legacy field name
 */
function getFieldValue(char: Character, field: CharacterField): unknown {
    const type = field.type || 'string';
    const charRecord = char as unknown as Record<string, unknown>;

    // 1. Try the primary path (e.g., 'data.system_prompt')
    let value = getValueByPath(char, field.path);
    if (isPopulatedValue(value, type)) {
        return value;
    }

    // 2. For top-level simple paths, also try direct property access
    //    (handles case where path is 'description' and we access char.description)
    if (!field.path.includes('.')) {
        value = charRecord[field.key];
        if (isPopulatedValue(value, type)) {
            return value;
        }
    }

    // 3. Check top-level fallback for fields that can exist at both levels
    //    (e.g., system_prompt can be at char.system_prompt OR char.data.system_prompt)
    const topLevelKey = TOP_LEVEL_FALLBACKS[field.key];
    if (topLevelKey) {
        value = charRecord[topLevelKey];
        if (isPopulatedValue(value, type)) {
            return value;
        }
    }

    // 4. Check legacy field names (e.g., creatorcomment -> creator_notes)
    const legacyKey = LEGACY_FIELD_NAMES[field.key];
    if (legacyKey) {
        value = charRecord[legacyKey];
        if (isPopulatedValue(value, type)) {
            return value;
        }
    }

    return undefined;
}

// ============================================================================
// FIELD EXTRACTION
// ============================================================================

/**
 * Get all populated fields from a character
 */
export function getPopulatedFields(char: Character): PopulatedField[] {
    if (!char) return [];

    const populated: PopulatedField[] = [];

    for (const field of CHARACTER_FIELDS) {
        const value = getFieldValue(char, field);

        if (value === undefined) {
            continue;
        }

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
 * Get token counts per field (for display)
 */
export async function getFieldTokenCounts(char: Character): Promise<Map<string, number>> {
    const fields = getPopulatedFields(char);
    const counts = new Map<string, number>();

    for (const field of fields) {
        const tokens = await getTokenCount(field.value);
        if (tokens !== null) {
            counts.set(field.key, tokens);
        }
    }

    return counts;
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

/**
 * Check if a character appears to be "shallow" (missing data.* fields).
 * Useful for debugging when unshallowCharacter wasn't called.
 */
export function isShallowCharacter(char: Character): boolean {
    if (!char) return true;

    // Shallow characters typically have name/avatar but no data object
    // or an empty/minimal data object
    if (!char.data) return true;

    // Check for typical V2 fields that should be in data
    const hasV2Data = !!(
        char.data.description ||
        char.data.personality ||
        char.data.first_mes ||
        char.data.system_prompt
    );

    return !hasV2Data;
}

/**
 * Get diagnostic info about character data structure.
 * Useful for debugging field extraction issues.
 */
export function getCharacterDiagnostics(char: Character): {
    hasData: boolean;
    isShallow: boolean;
    topLevelFields: string[];
    dataFields: string[];
    extensionFields: string[];
} {
    if (!char) {
        return {
            hasData: false,
            isShallow: true,
            topLevelFields: [],
            dataFields: [],
            extensionFields: [],
        };
    }

    const charRecord = char as unknown as Record<string, unknown>;

    const topLevelFields = Object.keys(charRecord).filter(k => {
        const val = charRecord[k];
        return val !== undefined && val !== null && val !== '' &&
               typeof val !== 'object';
    });

    const dataFields = char.data
        ? Object.keys(char.data).filter(k => {
            const val = (char.data as Record<string, unknown>)[k];
            return val !== undefined && val !== null && val !== '';
        })
        : [];

    const extensionFields = char.data?.extensions
        ? Object.keys(char.data.extensions).filter(k => {
            const val = (char.data!.extensions as Record<string, unknown>)[k];
            return val !== undefined && val !== null;
        })
        : [];

    return {
        hasData: !!char.data,
        isShallow: isShallowCharacter(char),
        topLevelFields,
        dataFields,
        extensionFields,
    };
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
    return `# CHARACTER: ${char.name}\n\n${sections.join('\n\n')}`;
}

/**
 * Build character summary using only selected fields.
 * Sanitizes placeholders to prevent ST substitution.
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

    let result: string;
    if (sections.length === 0) {
        result = `# CHARACTER: ${char.name}\n\n(No fields selected)`;
    } else {
        result = `# CHARACTER: ${char.name}\n\n${sections.join('\n\n')}`;
    }

    // CRITICAL: Replace placeholders with actual name
    // This prevents ST's substituteParams from replacing with active chat character
    return result
        .replace(/\{\{char\}\}/gi, char.name)
        .replace(/\{\{charName\}\}/gi, char.name);
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
export function getFieldPreview(value: string, maxLength: number = 100): string {
    if (value.length <= maxLength) {
        return value;
    }
    return value.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a character has enough content to analyze
 */
export function hasAnalyzableContent(char: Character): boolean {
    const fields = getPopulatedFields(char);
    return fields.length > 0;
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

    const fields = getPopulatedFields(char);
    if (fields.length === 0) {
        issues.push('Character has no populated fields');

        // Add diagnostic hint
        if (isShallowCharacter(char)) {
            issues.push('Character appears to be shallow-loaded (missing data.* fields)');
        }
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
        .map((char, index) => ({
            char,
            index,
            searchText: [
                char.name,
                char.description?.substring(0, 200),
                char.personality?.substring(0, 100),
            ].filter(Boolean).join(' ').toLowerCase(),
        }))
        .filter(item => item.char?.name);
}
