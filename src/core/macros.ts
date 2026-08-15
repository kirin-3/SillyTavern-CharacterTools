const MACRO_SENTINELS = Object.freeze({
    '{{user}}': '__CT_MACRO_USER__',
    '{{persona}}': '__CT_MACRO_PERSONA__',
    '{{original}}': '__CT_MACRO_ORIGINAL__',
});

export const ST_MACRO_SENTINELS = Object.freeze(Object.values(MACRO_SENTINELS));

/** Protect card macros from SillyTavern substitution in generateRaw. */
export function escapeSTMacros(text: string, charName: string): string {
    let result = text.replace(/\{\{char\}\}/gi, charName);
    for (const [macro, sentinel] of Object.entries(MACRO_SENTINELS)) {
        result = result.split(macro).join(sentinel);
    }
    return result;
}

/** Restore every macro sentinel exactly. */
export function unescapeSTMacros(text: string): string {
    let result = text;
    for (const [macro, sentinel] of Object.entries(MACRO_SENTINELS)) {
        result = result.split(sentinel).join(macro);
    }
    return result;
}

export function findUnrevertedMacroSentinels(text: string): string[] {
    return [...new Set(text.match(/__CT_MACRO_[A-Z_]+__/g) ?? [])];
}

function isWordCharacter(character: string | undefined): boolean {
    return !!character && /[\p{L}\p{N}_]/u.test(character);
}

/** Restore whole-word occurrences of the exact character name before card writes. */
export function restoreCharacterNameMacro(text: string, charName: string): string {
    if (!charName) return text;

    let result = '';
    let cursor = 0;
    let index = text.indexOf(charName);

    while (index >= 0) {
        const before = index > 0 ? text[index - 1] : undefined;
        const afterIndex = index + charName.length;
        const after = afterIndex < text.length ? text[afterIndex] : undefined;

        if (!isWordCharacter(before) && !isWordCharacter(after)) {
            result += text.slice(cursor, index) + '{{char}}';
            cursor = afterIndex;
        }

        index = text.indexOf(charName, index + charName.length);
    }

    return result + text.slice(cursor);
}

export type CardContentPreparation =
    | { success: true; content: string }
    | { success: false; error: string; sentinels: string[] };

export function prepareContentForCard(text: string, charName: string): CardContentPreparation {
    const restored = restoreCharacterNameMacro(unescapeSTMacros(text), charName);
    const sentinels = findUnrevertedMacroSentinels(restored);
    if (sentinels.length > 0) {
        return {
            success: false,
            error: `Unrestored macro sentinel${sentinels.length === 1 ? '' : 's'}: ${sentinels.join(', ')}`,
            sentinels,
        };
    }

    return { success: true, content: restored };
}
