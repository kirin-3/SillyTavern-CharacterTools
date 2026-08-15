import assert from 'node:assert/strict';
import test from 'node:test';

import {
    extractBalancedJson,
    extractVerdictFromResponse,
    parseStructuredResponse,
    stripCodeFences,
    stripReasoningBlocks,
} from '../src/core/response-parser.ts';

test('parses fenced JSON', () => {
    const result = parseStructuredResponse('```json\n{"score":7}\n```', ['score']);
    assert.equal(result.status, 'repaired');
    assert.deepEqual(result.data, { score: 7 });
});

test('extracts verdict from structured output first', () => {
    assert.equal(extractVerdictFromResponse('{"verdict":"ACCEPT"}'), 'accept');
});

test('does not match ACCEPT inside acceptable', () => {
    assert.equal(extractVerdictFromResponse('This is acceptable.'), 'indeterminate');
});

test('reports conflicting prose verdicts as indeterminate', () => {
    assert.equal(extractVerdictFromResponse('Accept, but it needs work.'), 'indeterminate');
});

test('reports an empty verdict as indeterminate', () => {
    assert.equal(extractVerdictFromResponse(''), 'indeterminate');
});

test('extracts JSON surrounded by prose', () => {
    const result = parseStructuredResponse('Result follows: {"score":7} Thanks.', ['score']);
    assert.equal(result.status, 'repaired');
    assert.deepEqual(result.data, { score: 7 });
});

test('strips complete inline reasoning blocks', () => {
    assert.equal(stripReasoningBlocks('<think>work</think>{"score":7}'), '{"score":7}');
});

test('recovers JSON after an unterminated leading reasoning block', () => {
    const result = parseStructuredResponse('<think>work in progress\n{"score":7}', ['score']);
    assert.equal(result.status, 'repaired');
    assert.deepEqual(result.data, { score: 7 });
});

test('balances braces while respecting strings and escapes', () => {
    const text = String.raw`before {"message":"a } brace and \"quote\"","nested":{"ok":true}} after`;
    assert.equal(
        extractBalancedJson(text),
        String.raw`{"message":"a } brace and \"quote\"","nested":{"ok":true}}`,
    );
});

test('reports unrecoverable garbage', () => {
    const result = parseStructuredResponse('definitely not JSON', ['score']);
    assert.equal(result.status, 'unparseable');
    assert.equal(result.data, null);
});

test('reports missing required keys', () => {
    const result = parseStructuredResponse('{"summary":"ok"}', ['score']);
    assert.equal(result.status, 'unparseable');
    assert.deepEqual(result.missingKeys, ['score']);
});

test('strips both supported fence forms', () => {
    assert.equal(stripCodeFences('```json\n{"ok":true}\n```'), '{"ok":true}');
    assert.equal(stripCodeFences('```\n{"ok":true}\n```'), '{"ok":true}');
});
