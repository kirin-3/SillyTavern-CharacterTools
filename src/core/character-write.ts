import { debugLog } from '../debug';
import type { Character, RewriteReviewEntry } from '../types';
import { prepareContentForCard } from './macros';

type CharacterPatch = Record<string, unknown> & { avatar: string };

interface WriteSnapshot {
    avatar: string;
    name: string;
    patch: CharacterPatch;
}

let lastSnapshot: WriteSnapshot | null = null;

export async function checkCharacterWriteCapability(): Promise<boolean> {
    try {
        const response = await fetch('/api/characters/merge-attributes', {
            method: 'OPTIONS',
            headers: SillyTavern.getContext().getRequestHeaders(),
        });
        return response.ok;
    } catch (error) {
        debugLog('info', 'Character write capability check failed', error);
        return false;
    }
}

export function canRevertLastCharacterWrite(): boolean {
    return lastSnapshot !== null;
}

export async function applyRewriteChanges(
    target: Character,
    entries: RewriteReviewEntry[],
): Promise<void> {
    const current = requireMatchingCharacter(target);
    if (entries.length === 0) throw new Error('No rewrite changes were selected');
    if (entries.some(entry => !entry.writable)) {
        throw new Error('Lorebook changes are manual guidance and cannot be written automatically');
    }

    const patch = buildPatch(current, entries, false);
    const revertPatch = buildPatch(current, entries, true);
    await postCharacterPatch(patch);
    lastSnapshot = { avatar: current.avatar, name: current.name, patch: revertPatch };
    await refreshCharacter(current);
}

export async function revertLastCharacterWrite(target: Character): Promise<void> {
    if (!lastSnapshot) throw new Error('No character write is available to revert');
    const current = requireMatchingCharacter(target);
    if (current.avatar !== lastSnapshot.avatar || current.name !== lastSnapshot.name) {
        throw new Error('The revert target no longer matches the character that was written');
    }

    await postCharacterPatch(lastSnapshot.patch);
    lastSnapshot = null;
    await refreshCharacter(current);
}

function requireMatchingCharacter(target: Character): Character {
    const { characters } = SillyTavern.getContext();
    const current = (characters as Character[]).find(character => character.avatar === target.avatar);
    if (!current || current.name !== target.name) {
        throw new Error('The target character is missing or its identity changed since the pipeline ran');
    }
    return current;
}

/** Test-only export for verifying card patch construction without issuing writes. */
export function buildPatch(
    character: Character,
    entries: RewriteReviewEntry[],
    useOriginal: boolean,
): CharacterPatch {
    const patch: CharacterPatch = { avatar: character.avatar };
    const data: Record<string, unknown> = {};
    const topLevel = new Set(['description', 'personality', 'first_mes', 'scenario', 'mes_example']);
    const alternateGreetings = [...(character.data?.alternate_greetings ?? [])];

    for (const entry of entries) {
        const rawContent = useOriginal ? entry.original : entry.content;
        const prepared = prepareContentForCard(rawContent, character.name);
        if (!prepared.success) throw new Error(prepared.error);
        const content = prepared.content;

        if (topLevel.has(entry.field)) {
            patch[entry.field] = content;
            data[entry.field] = content;
        } else if (entry.field === 'alternate_greetings') {
            if (entry.index < 0 || entry.index >= alternateGreetings.length) {
                throw new Error(`Alternate greeting index ${entry.index} is no longer valid`);
            }
            alternateGreetings[entry.index] = content;
            data.alternate_greetings = alternateGreetings;
        } else if (entry.field === 'depth_prompt') {
            data.extensions = {
                ...(character.data?.extensions ?? {}),
                depth_prompt: {
                    ...(character.data?.extensions?.depth_prompt ?? { depth: 4, role: 'system' }),
                    prompt: content,
                },
            };
        } else if (entry.field !== 'character_book') {
            data[entry.field] = content;
        }
    }

    if (Object.keys(data).length > 0) patch.data = data;
    return patch;
}

async function postCharacterPatch(patch: CharacterPatch): Promise<void> {
    const response = await fetch('/api/characters/merge-attributes', {
        method: 'POST',
        headers: {
            ...SillyTavern.getContext().getRequestHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(`Character write failed (${response.status}): ${message || response.statusText}`);
    }
}

async function refreshCharacter(character: Character): Promise<void> {
    const context = SillyTavern.getContext();
    if (context.getCharacters) {
        await context.getCharacters();
    } else {
        const response = await fetch('/api/characters/get', {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify({ avatar_url: character.avatar }),
        });
        if (!response.ok) {
            throw new Error(`Character was written, but refresh failed (${response.status})`);
        }

        const refreshed = await response.json() as Character;
        const currentIndex = context.characters.findIndex(item => item.avatar === character.avatar);
        if (currentIndex === -1 || refreshed.avatar !== character.avatar || refreshed.name !== character.name) {
            throw new Error('Character was written, but the refreshed card no longer matches the original target');
        }
        context.characters[currentIndex] = refreshed;
    }

    const index = context.characters.findIndex(item => item.avatar === character.avatar);
    if (index === -1) throw new Error('Character was written, but it is missing after refresh');
    await context.eventSource.emit(context.eventTypes.CHARACTER_EDITED, index);
}
