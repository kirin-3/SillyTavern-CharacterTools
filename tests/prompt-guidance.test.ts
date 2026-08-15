import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMalformedResponseRetryPrompt } from '../src/core/generator.ts';
import { buildStagePrompt } from '../src/core/pipeline.ts';
import { buildStructuredOutputGuidance } from '../src/core/schema.ts';
import type { PipelineState, StageConfig, StageResult, StructuredOutputSchema } from '../src/types.ts';

const extensionSettings: Record<string, unknown> = {};
(globalThis as typeof globalThis & { SillyTavern: unknown }).SillyTavern = {
    libs: {
        lodash: {
            escapeRegExp(value: string): string {
                return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            },
        },
    },
    getContext: () => ({ extensionSettings, saveSettingsDebounced() {} }),
};

const schema: StructuredOutputSchema = {
    name: 'Custom',
    strict: true,
    value: {
        type: 'object',
        additionalProperties: false,
        properties: {
            result: { type: 'string' },
            verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
        },
        required: ['result', 'verdict'],
    },
};

const config = (structured: boolean): StageConfig => ({
    promptPresetId: null,
    customPrompt: 'Do the work.',
    schemaPresetId: null,
    customSchema: JSON.stringify(schema),
    useStructuredOutput: structured,
});

const result: StageResult = {
    response: '{}',
    isStructured: true,
    promptUsed: 'prompt',
    schemaUsed: schema,
    timestamp: 1,
    locked: false,
};

function state(structured = true): PipelineState {
    return {
        character: {
            name: 'Example', avatar: '', description: 'Description', personality: '',
            first_mes: '', mes_example: '', scenario: '',
        },
        characterIndex: 0,
        results: { score: null, rewrite: null, analyze: null },
        configs: { score: config(structured), rewrite: config(structured), analyze: config(structured) },
        selectedStages: ['score', 'rewrite'],
        currentStage: null,
        stageStatus: { score: 'pending', rewrite: 'pending', analyze: 'pending' },
        iterationCount: 0,
        iterationHistory: [],
        isRefining: false,
        selectedFields: { description: true },
        exportData: null,
    };
}

test('ordinary prompt ends with guidance derived from the active custom schema', () => {
    const prompt = buildStagePrompt(state(), 'score')!;
    assert.ok(prompt.endsWith(buildStructuredOutputGuidance(schema)));
    assert.match(prompt, /Required root keys: result, verdict/);
    assert.match(prompt, /verdict: "PASS", "FAIL"/);
    assert.match(prompt, /"result": "<replacement text>"/);
    assert.doesNotMatch(prompt, /\$schema|properties|additionalProperties/);
});

test('refinement prompt receives the same final shape guidance', () => {
    const pipeline = state();
    pipeline.isRefining = true;
    pipeline.results.rewrite = result;
    pipeline.results.analyze = result;

    const prompt = buildStagePrompt(pipeline, 'rewrite')!;
    assert.ok(prompt.endsWith(buildStructuredOutputGuidance(schema)));
    assert.match(prompt, /# Refinement Instructions/);
});

test('prompt omits shape guidance when structured output is disabled', () => {
    const prompt = buildStagePrompt(state(false), 'score')!;
    assert.doesNotMatch(prompt, /# Required Structured Output/);
});

test('retry places the same correct guidance after the malformed excerpt', () => {
    const original = `Original\n\n${buildStructuredOutputGuidance(schema)}`;
    const prompt = buildMalformedResponseRetryPrompt(original, '{"bad":true}', 'missing result', schema);
    const excerptPosition = prompt.indexOf('Malformed response excerpt:');
    const finalGuidancePosition = prompt.lastIndexOf('# Required Structured Output');
    assert.ok(excerptPosition >= 0);
    assert.ok(finalGuidancePosition > excerptPosition);
    assert.equal(prompt.slice(finalGuidancePosition), buildStructuredOutputGuidance(schema));
});
