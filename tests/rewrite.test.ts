import assert from 'node:assert/strict';
import test from 'node:test';

import type { Character } from '../src/types.ts';
import './register-ts-hooks.mjs';

const { buildRewriteReview, parseRewritePayload } = await import('../src/core/rewrite.ts');

const character: Character = {
    name: 'Aster',
    avatar: 'aster.png',
    description: 'Patient archivist',
    personality: 'Methodical',
    first_mes: 'Welcome.',
    mes_example: 'Aster: Example',
    scenario: 'Inside the archive',
    data: {
        alternate_greetings: ['First alternate', 'Second alternate'],
        extensions: {
            depth_prompt: { prompt: 'Remember the catalog.', depth: 4, role: 'system' },
        },
        character_book: {
            name: 'Archive lore',
            entries: [],
        },
    },
};

function responseWith(changes: unknown[]): string {
    return JSON.stringify({ changes, summary: 'summary' });
}

test('discards malformed and unselected rewrite entries', () => {
    const parsed = parseRewritePayload(responseWith([
        null,
        { field: 'not_a_field', index: -1, content: 'x', rationale: 'x' },
        { field: 'description', index: 1.5, content: 'x', rationale: 'x' },
        { field: 'description', index: -1, rationale: 'missing content' },
        { field: 'description', index: -1, content: 'x', rationale: 42 },
        { field: 'personality', index: -1, content: 'x', rationale: 'not selected' },
        { field: 'alternate_greetings', index: 1, content: 'x', rationale: 'wrong greeting' },
    ]), {
        description: true,
        personality: false,
        alternate_greetings: [0],
    });

    assert.deepEqual(parsed.payload?.changes, []);
    assert.equal(parsed.discarded.length, 7);
    assert.match(parsed.discarded[0].reason, /not an object/);
    assert.match(parsed.discarded[1].reason, /unknown field/);
    assert.match(parsed.discarded[2].reason, /invalid index/);
    assert.match(parsed.discarded[3].reason, /invalid index, content, or rationale/);
    assert.match(parsed.discarded[4].reason, /invalid index, content, or rationale/);
    assert.match(parsed.discarded[5].reason, /not selected/);
    assert.match(parsed.discarded[6].reason, /not selected/);
});

test('enforces rewrite entry index conventions', () => {
    const parsed = parseRewritePayload(responseWith([
        { field: 'alternate_greetings', index: -1, content: 'x', rationale: 'x' },
        { field: 'description', index: 0, content: 'x', rationale: 'x' },
    ]));

    assert.deepEqual(parsed.payload?.changes, []);
    assert.match(parsed.discarded[0].reason, /non-negative index/);
    assert.match(parsed.discarded[1].reason, /index -1/);
});

test('builds rewrite review entries from original character content', () => {
    const response = responseWith([
        {
            field: 'description',
            index: -1,
            content: character.description,
            rationale: 'unchanged',
        },
        {
            field: 'alternate_greetings',
            index: 1,
            content: 'Updated alternate',
            rationale: 'update',
        },
        {
            field: 'character_book',
            index: -1,
            content: 'Manual lore guidance',
            rationale: 'manual only',
        },
    ]);
    const review = buildRewriteReview(response, character);

    assert.equal(review.entries[0].original, character.description);
    assert.equal(review.entries[0].unchanged, true);
    assert.equal(review.entries[0].writable, true);
    assert.equal(review.entries[1].original, 'Second alternate');
    assert.equal(review.entries[1].unchanged, false);
    assert.equal(review.entries[1].writable, true);
    assert.equal(review.entries[2].original, JSON.stringify(character.data?.character_book, null, 2));
    assert.equal(review.entries[2].writable, false);
    assert.deepEqual(review.entries.map(entry => entry.writable), [true, true, false]);
});
