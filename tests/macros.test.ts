import assert from 'node:assert/strict';
import test from 'node:test';

import {
    escapeSTMacros,
    findUnrevertedMacroSentinels,
    prepareContentForCard,
    restoreCharacterNameMacro,
    unescapeSTMacros,
} from '../src/core/macros.ts';

for (const macro of ['{{user}}', '{{persona}}', '{{original}}']) {
    test(`round-trips ${macro} byte-identically`, () => {
        const input = `before ${macro} after`;
        assert.equal(unescapeSTMacros(escapeSTMacros(input, 'Aster')), input);
    });
}

test('restores only whole-word exact character names', () => {
    assert.equal(
        restoreCharacterNameMacro('Aster met Asteroid. aster stayed. (Aster)', 'Aster'),
        '{{char}} met Asteroid. aster stayed. ({{char}})',
    );
});

test('fails closed on unknown sentinel tokens', () => {
    const result = prepareContentForCard('hello __CT_MACRO_UNKNOWN__', 'Aster');
    assert.equal(result.success, false);
    assert.deepEqual(findUnrevertedMacroSentinels('x __CT_MACRO_UNKNOWN__ x'), ['__CT_MACRO_UNKNOWN__']);
});
