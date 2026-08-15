import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILTIN_SCHEMA_PRESETS } from '../src/constants.ts';
import {
    buildSchemaExample,
    collectSchemaEnumConstraints,
} from '../src/core/schema.ts';
import type { JsonSchemaValue, StructuredOutputSchema } from '../src/types.ts';

function assertConforms(value: unknown, node: JsonSchemaValue, path = '(root)'): void {
    if (node.enum) assert.ok(node.enum.some(candidate => Object.is(candidate, value)), `${path} enum`);
    switch (node.type) {
        case 'object': {
            assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${path} object`);
            const record = value as Record<string, unknown>;
            for (const key of node.required ?? []) {
                assert.ok(Object.hasOwn(record, key), `${path}.${key} required`);
                assertConforms(record[key], node.properties![key], `${path}.${key}`);
            }
            break;
        }
        case 'array':
            assert.ok(Array.isArray(value), `${path} array`);
            assert.equal(value.length, 1, `${path} has one example item`);
            assertConforms(value[0], Array.isArray(node.items) ? node.items[0] : node.items!, `${path}[]`);
            break;
        case 'string': assert.equal(typeof value, 'string', `${path} string`); break;
        case 'number':
        case 'integer': assert.equal(typeof value, 'number', `${path} number`); break;
        case 'boolean': assert.equal(typeof value, 'boolean', `${path} boolean`); break;
    }
}

for (const id of [
    'builtin_schema_score',
    'builtin_schema_quick_score',
    'builtin_schema_rewrite',
    'builtin_schema_analyze',
]) {
    test(`builds a conforming example for ${id}`, () => {
        const schema = BUILTIN_SCHEMA_PRESETS.find(preset => preset.id === id)!.schema;
        const example = buildSchemaExample(schema);
        assertConforms(example, schema.value);
        assert.doesNotMatch(JSON.stringify(example), /\.\.\./);
    });
}

test('builds nested custom examples and collects enum paths', () => {
    const schema: StructuredOutputSchema = {
        name: 'Nested',
        value: {
            type: 'object',
            properties: {
                active: { type: 'boolean' },
                items: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            kind: { type: 'string', enum: ['alpha', 'beta'] },
                            count: { type: 'integer' },
                        },
                        required: ['kind', 'count'],
                    },
                },
            },
            required: ['active', 'items'],
        },
    };
    const example = buildSchemaExample(schema);
    assert.deepEqual(example, { active: false, items: [{ kind: 'alpha', count: 0 }] });
    assertConforms(example, schema.value);
    assert.deepEqual(collectSchemaEnumConstraints(schema), [
        { path: 'items[].kind', values: ['alpha', 'beta'] },
    ]);
});

test('an object schema with no required keys produces an empty object', () => {
    const schema: StructuredOutputSchema = {
        name: 'Optional',
        value: { type: 'object', properties: { note: { type: 'string' } } },
    };
    assert.deepEqual(buildSchemaExample(schema), {});
    assertConforms(buildSchemaExample(schema), schema.value);
});
