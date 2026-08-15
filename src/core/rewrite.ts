import { CHARACTER_FIELDS } from '../constants';
import { debugLog } from '../debug';
import type {
    Character,
    CharacterBook,
    CharacterFieldKey,
    FieldSelection,
    RewriteChange,
    RewritePayload,
    RewriteReviewEntry,
} from '../types';
import { parseStructuredResponse } from './response-parser';

const FIELD_KEYS = new Set(CHARACTER_FIELDS.map(field => field.key));

export interface ParsedRewrite {
    payload: RewritePayload | null;
    discarded: Array<{ index: number; reason: string }>;
    error?: string;
}

export function parseRewritePayload(
    response: string,
    selectedFields?: FieldSelection,
): ParsedRewrite {
    const parsed = parseStructuredResponse(response, ['changes', 'summary']);
    if (parsed.status === 'unparseable') {
        return { payload: null, discarded: [], error: parsed.error };
    }

    if (!Array.isArray(parsed.data.changes) || typeof parsed.data.summary !== 'string') {
        return { payload: null, discarded: [], error: 'Rewrite payload has invalid changes or summary' };
    }

    const changes: RewriteChange[] = [];
    const discarded: Array<{ index: number; reason: string }> = [];

    parsed.data.changes.forEach((candidate, index) => {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            discarded.push({ index, reason: 'entry is not an object' });
            return;
        }

        const entry = candidate as Record<string, unknown>;
        if (typeof entry.field !== 'string' || !FIELD_KEYS.has(entry.field)) {
            discarded.push({ index, reason: `unknown field: ${String(entry.field)}` });
            return;
        }
        if (typeof entry.index !== 'number' || !Number.isInteger(entry.index) ||
            typeof entry.content !== 'string' || typeof entry.rationale !== 'string') {
            discarded.push({ index, reason: 'entry has an invalid index, content, or rationale' });
            return;
        }

        const field = entry.field as CharacterFieldKey;
        const selected = selectedFields?.[field];
        if (selectedFields && (selected === undefined || selected === false ||
            (Array.isArray(selected) && !selected.includes(entry.index)))) {
            discarded.push({ index, reason: `field or index was not selected: ${field}[${entry.index}]` });
            return;
        }

        if (field === 'alternate_greetings' && entry.index < 0) {
            discarded.push({ index, reason: 'alternate_greetings requires its original non-negative index' });
            return;
        }
        if (field !== 'alternate_greetings' && entry.index !== -1) {
            discarded.push({ index, reason: `${field} must use index -1` });
            return;
        }

        changes.push({
            field,
            index: entry.index,
            content: entry.content,
            rationale: entry.rationale,
        });
    });

    for (const item of discarded) {
        debugLog('info', 'Discarded rewrite entry', item);
    }

    return {
        payload: { changes, summary: parsed.data.summary },
        discarded,
    };
}

export function buildRewriteReview(
    response: string,
    character: Character,
    selectedFields?: FieldSelection,
): { entries: RewriteReviewEntry[]; summary: string; error?: string } {
    const parsed = parseRewritePayload(response, selectedFields);
    if (!parsed.payload) return { entries: [], summary: '', error: parsed.error };

    const entries = parsed.payload.changes.map((change, sourceIndex) => {
        const original = getCharacterFieldContent(character, change.field, change.index);
        return {
            ...change,
            sourceIndex,
            original,
            unchanged: original === change.content,
            writable: change.field !== 'character_book',
        };
    });

    return { entries, summary: parsed.payload.summary };
}

export function getCharacterFieldContent(
    character: Character,
    field: CharacterFieldKey,
    index: number,
): string {
    if (field === 'alternate_greetings') {
        return character.data?.alternate_greetings?.[index] ?? '';
    }
    if (field === 'depth_prompt') {
        return character.data?.extensions?.depth_prompt?.prompt ?? '';
    }
    if (field === 'character_book') {
        const book = character.data?.character_book as CharacterBook | undefined;
        return book ? JSON.stringify(book, null, 2) : '';
    }

    const descriptor = CHARACTER_FIELDS.find(item => item.key === field);
    if (!descriptor) return '';

    let value: unknown = character;
    for (const part of descriptor.path.split('.')) {
        if (!value || typeof value !== 'object') return '';
        value = (value as Record<string, unknown>)[part];
    }
    return typeof value === 'string' ? value : '';
}
