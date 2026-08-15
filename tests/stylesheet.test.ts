import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stylesheet = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

test('all font-size declarations resolve through Character Tools scale tokens', () => {
    const declarations = [...stylesheet.matchAll(/font-size\s*:\s*([^;]+);/g)].map(match => match[1].trim());
    assert.ok(declarations.length > 0);
    assert.deepEqual(
        declarations.filter(value => !/^var\(--ct-font-[a-z-]+\)$/.test(value)),
        [],
    );
});

test('font tokens are rem-based, floored, and body text is at least 13px', () => {
    const tokens = [...stylesheet.matchAll(/(--ct-font-[a-z-]+)\s*:\s*([^;]+);/g)];
    assert.ok(tokens.length >= 4);
    for (const [, name, value] of tokens) {
        assert.match(value, /^max\(\d+px, \d*\.?\d+rem\)$/i, name);
        assert.doesNotMatch(value, /(^|[^r])em\b/i, name);
    }
    assert.match(stylesheet, /--ct-font-base:\s*max\(13px,/);
});

test('workspace CSS contains result-priority, collapsed-rail, and local-overflow rules', () => {
    assert.match(stylesheet, /character_tools_has_results/);
    assert.match(stylesheet, /character_tools_config_collapsed/);
    assert.match(stylesheet, /\.character_tools_results_body\s*\{[^}]*overflow-x:\s*auto;/s);
});
