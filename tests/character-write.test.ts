import assert from 'node:assert/strict';
import test from 'node:test';

import type { Character, RewriteReviewEntry } from '../src/types.ts';
import './register-ts-hooks.mjs';

const { buildPatch } = await import('../src/core/character-write.ts');

const character: Character = {
    name: 'Aster',
    avatar: 'aster.png',
    description: 'Old description',
    personality: 'Old personality',
    first_mes: 'Old greeting',
    mes_example: 'Old examples',
    scenario: 'Old scenario',
    data: {
        description: 'Old description',
        alternate_greetings: ['Alternate zero', 'Alternate one', 'Alternate two'],
        extensions: {
            fav: true,
            world: 'archive',
            depth_prompt: { prompt: 'Old depth prompt', depth: 6, role: 'assistant' },
        },
        character_book: { entries: [] },
    },
};

const entries: RewriteReviewEntry[] = [
    {
        field: 'description',
        index: -1,
        content: 'New description',
        rationale: 'update',
        sourceIndex: 0,
        original: 'Old description',
        unchanged: false,
        writable: true,
    },
    {
        field: 'alternate_greetings',
        index: 1,
        content: 'Updated alternate',
        rationale: 'update',
        sourceIndex: 1,
        original: 'Alternate one',
        unchanged: false,
        writable: true,
    },
    {
        field: 'depth_prompt',
        index: -1,
        content: 'New depth prompt',
        rationale: 'update',
        sourceIndex: 2,
        original: 'Old depth prompt',
        unchanged: false,
        writable: true,
    },
    {
        field: 'character_book',
        index: -1,
        content: 'Do not write this',
        rationale: 'manual only',
        sourceIndex: 3,
        original: '{"entries":[]}',
        unchanged: false,
        writable: false,
    },
];

test('buildPatch places fields correctly and preserves nested siblings', () => {
    const patch = buildPatch(character, entries, false);
    const data = patch.data as Record<string, unknown>;
    const extensions = data.extensions as Record<string, unknown>;

    assert.equal(patch.description, 'New description');
    assert.equal(data.description, 'New description');
    assert.deepEqual(data.alternate_greetings, [
        'Alternate zero',
        'Updated alternate',
        'Alternate two',
    ]);
    assert.deepEqual(extensions.depth_prompt, {
        prompt: 'New depth prompt',
        depth: 6,
        role: 'assistant',
    });
    assert.equal(extensions.fav, true);
    assert.equal(extensions.world, 'archive');
    assert.equal('character_book' in data, false);
});

test('buildPatch creates a revert patch for every forward-written field', () => {
    const patch = buildPatch(character, entries, true);
    const data = patch.data as Record<string, unknown>;
    const extensions = data.extensions as Record<string, unknown>;

    assert.equal(patch.description, 'Old description');
    assert.equal(data.description, 'Old description');
    assert.deepEqual(data.alternate_greetings, [
        'Alternate zero',
        'Alternate one',
        'Alternate two',
    ]);
    assert.deepEqual(extensions.depth_prompt, {
        prompt: 'Old depth prompt',
        depth: 6,
        role: 'assistant',
    });
    assert.equal('character_book' in data, false);
});

test('buildPatch fails closed when an alternate greeting index is stale', () => {
    const staleEntry: RewriteReviewEntry = {
        ...entries[1],
        index: 99,
    };

    assert.throws(
        () => buildPatch(character, [staleEntry], false),
        /Alternate greeting index 99 is no longer valid/,
    );
});
