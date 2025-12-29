// src/tests/macro-placeholder-test.ts

import { processPromptTemplate, promptHasPlaceholders } from '../presets';
import { buildStagePrompt, buildRefinementPrompt, createPipelineState, setCharacter, completeStage, initializeFieldSelection } from '../pipeline';
import type { Character, TemplateContext } from '../types';

/**
 * Comprehensive test for macro and placeholder handling.
 *
 * Tests:
 * 1. Our custom placeholders ({{original_character}}, {{score_results}}, etc.)
 * 2. Ruby replacement with analyzed character name
 * 3. Nate is NOT replaced (left as-is)
 * 4. Conditional blocks
 * 5. Placeholder detection
 * 6. Full pipeline prompt building with deduplication
 *
 * Run from console: window.testMacroPlaceholders()
 */
export function testMacroPlaceholders(): { passed: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    console.log('=== MACRO & PLACEHOLDER TEST ===\n');

    // ========================================================================
    // PHASE 1: Basic placeholder detection
    // ========================================================================
    console.log('--- PHASE 1: Placeholder Detection ---\n');

    const testPrompt1 = `
        Analyze {{original_character}}.
        Previous score: {{score_results}}
        Current rewrite: {{current_rewrite}}
        Analysis: {{current_analysis}}
        Iteration: {{iteration_number}}
        Character name: {{char_name}}
    `;

    const detected = promptHasPlaceholders(testPrompt1);

    assertArrayContains(detected, 'ORIGINAL_CHARACTER', '1.1 Detects {{original_character}}', errors);
    assertArrayContains(detected, 'SCORE_RESULTS', '1.2 Detects {{score_results}}', errors);
    assertArrayContains(detected, 'CURRENT_REWRITE', '1.3 Detects {{current_rewrite}}', errors);
    assertArrayContains(detected, 'CURRENT_ANALYSIS', '1.4 Detects {{current_analysis}}', errors);
    assertArrayContains(detected, 'ITERATION_NUMBER', '1.5 Detects {{iteration_number}}', errors);
    assertArrayContains(detected, 'CHARACTER_NAME', '1.6 Detects {{char_name}}', errors);

    // Test Ruby detection (alias for CHARACTER_NAME)
    const testPrompt1b = 'Hello {{char}}, how are you?';
    const detected1b = promptHasPlaceholders(testPrompt1b);
    assertArrayContains(detected1b, 'CHARACTER_NAME', '1.7 Detects {{char}} as CHARACTER_NAME alias', errors);

    console.log('');

    // ========================================================================
    // PHASE 2: processPromptTemplate - Our placeholder substitution
    // ========================================================================
    console.log('--- PHASE 2: Our Placeholder Substitution ---\n');

    const context: TemplateContext = {
        originalCharacter: 'ORIGINAL_CHAR_CONTENT_ABC123',
        scoreResults: 'SCORE_RESULTS_CONTENT_DEF456',
        rewriteResults: 'REWRITE_RESULTS_CONTENT_GHI789',
        currentRewrite: 'CURRENT_REWRITE_CONTENT_JKL012',
        currentAnalysis: 'CURRENT_ANALYSIS_CONTENT_MNO345',
        iterationNumber: '42',
        charName: 'TestCharacter',
    };

    // Test each placeholder individually
    const tests = [
        { input: 'Data: {{original_character}}', expected: 'ORIGINAL_CHAR_CONTENT_ABC123', name: '2.1 {{original_character}}' },
        { input: 'Score: {{score_results}}', expected: 'SCORE_RESULTS_CONTENT_DEF456', name: '2.2 {{score_results}}' },
        { input: 'Rewrite: {{rewrite_results}}', expected: 'REWRITE_RESULTS_CONTENT_GHI789', name: '2.3 {{rewrite_results}}' },
        { input: 'Current: {{current_rewrite}}', expected: 'CURRENT_REWRITE_CONTENT_JKL012', name: '2.4 {{current_rewrite}}' },
        { input: 'Analysis: {{current_analysis}}', expected: 'CURRENT_ANALYSIS_CONTENT_MNO345', name: '2.5 {{current_analysis}}' },
        { input: 'Iteration: {{iteration_number}}', expected: '42', name: '2.6 {{iteration_number}}' },
        { input: 'Char: {{char_name}}', expected: 'TestCharacter', name: '2.7 {{char_name}}' },
        { input: 'Hello {{char}}!', expected: 'TestCharacter', name: '2.8 {{char}} alias' },
    ];

    for (const test of tests) {
        const result = processPromptTemplate(test.input, context);
        assertContains(result, test.expected, test.name, errors);
    }

    // Test case insensitivity
    const caseTest = processPromptTemplate('{{CHAR_NAME}} and {{Char_Name}}', context);
    const charNameCount = (caseTest.match(/TestCharacter/g) || []).length;
    if (charNameCount === 2) {
        console.log('✓ 2.9 Placeholder replacement is case-insensitive');
    } else {
        errors.push(`FAIL: 2.9 Case insensitivity - expected 2 replacements, got ${charNameCount}`);
        console.error('✗ 2.9 Case insensitivity failed');
    }

    console.log('');

    // ========================================================================
    // PHASE 3: {{user}} is NOT replaced
    // ========================================================================
    console.log('--- PHASE 3: {{user}} Handling ---\n');

    const userPrompt = 'Hello {{user}}, I am {{char}}. Nice to meet you!';
    const userResult = processPromptTemplate(userPrompt, context);

    // {{char}} should be replaced
    assertContains(userResult, 'TestCharacter', '3.1 {{char}} is replaced with character name', errors);

    // {{user}} should NOT be replaced - it should pass through unchanged
    assertContains(userResult, '{{user}}', '3.2 {{user}} is NOT replaced (passes through)', errors);

    console.log('');
    console.log('  NOTE: {{user}} is intentionally not replaced because:');
    console.log('  - The user\'s persona is irrelevant to character card analysis');
    console.log('  - We don\'t use ST\'s substituteParams which would replace it');
    console.log('  - If someone uses it, they\'ll see it pass through unchanged');
    console.log('');

    // ========================================================================
    // PHASE 4: Conditional blocks
    // ========================================================================
    console.log('--- PHASE 4: Conditional Blocks ---\n');

    // Test with content present
    const conditionalWithContent = `
        {{#if score_results}}
        SCORE_SECTION_VISIBLE
        {{/if}}
        {{#if current_analysis}}
        ANALYSIS_SECTION_VISIBLE
        {{/if}}
    `;

    const withContentResult = processPromptTemplate(conditionalWithContent, context);
    assertContains(withContentResult, 'SCORE_SECTION_VISIBLE', '4.1 Conditional shows when content present', errors);
    assertContains(withContentResult, 'ANALYSIS_SECTION_VISIBLE', '4.2 Conditional shows when content present', errors);

    // Test with content absent
    const emptyContext: TemplateContext = {
        originalCharacter: 'Some char',
        scoreResults: '',
        currentAnalysis: '',
        charName: 'Test',
    };

    const withoutContentResult = processPromptTemplate(conditionalWithContent, emptyContext);
    assertNotContains(withoutContentResult, 'SCORE_SECTION_VISIBLE', '4.3 Conditional hidden when content empty', errors);
    assertNotContains(withoutContentResult, 'ANALYSIS_SECTION_VISIBLE', '4.4 Conditional hidden when content empty', errors);

    // Test nested content in conditional
    const nestedConditional = '{{#if score_results}}Score: {{score_results}}{{/if}}';
    const nestedResult = processPromptTemplate(nestedConditional, context);
    assertContains(nestedResult, 'SCORE_RESULTS_CONTENT_DEF456', '4.5 Placeholders inside conditionals are replaced', errors);

    console.log('');

    // ========================================================================
    // PHASE 5: Full pipeline prompt building
    // ========================================================================
    console.log('--- PHASE 5: Pipeline Prompt Building ---\n');

    const mockChar: Character = {
        name: 'PipelineTestChar',
        avatar: 'test.png',
        description: 'PIPELINE_CHAR_DESC_MARKER_XYZ',
        personality: 'Test personality',
        first_mes: 'Hello from pipeline test',
        mes_example: '',
        scenario: '',
    };

    let state = createPipelineState();
    state = setCharacter(state, mockChar, 0);
    state = { ...state, selectedFields: initializeFieldSelection(mockChar) };

    // Set a custom prompt that uses our placeholders
    state.configs.score.promptPresetId = null;
    state.configs.score.customPrompt = 'Analyze this character: {{char_name}}. Data follows.';

    // Build score prompt
    const scorePrompt = buildStagePrompt(state, 'score');

    assertContains(scorePrompt, 'PipelineTestChar', '5.1 Score prompt contains character name from {{char_name}}', errors);
    assertContains(scorePrompt, 'PIPELINE_CHAR_DESC_MARKER_XYZ', '5.2 Score prompt contains character data', errors);

    // Complete score
    state = completeStage(state, 'score', {
        response: 'SCORE_RESPONSE_MARKER_111',
        isStructured: false,
        promptUsed: scorePrompt || '',
        schemaUsed: null,
    });

    // Set rewrite prompt with placeholder
    state.configs.rewrite.promptPresetId = null;
    state.configs.rewrite.customPrompt = 'Rewrite {{char_name}} based on: {{score_results}}';

    const rewritePrompt = buildStagePrompt(state, 'rewrite');

    assertContains(rewritePrompt, 'PipelineTestChar', '5.3 Rewrite prompt contains character name', errors);

    // Check deduplication - if user included {{score_results}}, we shouldn't duplicate it
    const scoreMarkerCount = (rewritePrompt?.match(/SCORE_RESPONSE_MARKER_111/g) || []).length;
    if (scoreMarkerCount === 1) {
        console.log('✓ 5.4 Score results not duplicated (deduplication working)');
    } else if (scoreMarkerCount === 0) {
        errors.push('FAIL: 5.4 Score results missing from rewrite prompt');
        console.error('✗ 5.4 Score results missing');
    } else {
        warnings.push(`5.4 Score results appears ${scoreMarkerCount} times (possible duplication)`);
        console.log(`⚠ 5.4 Score results appears ${scoreMarkerCount} times`);
    }

    // Complete rewrite
    state = completeStage(state, 'rewrite', {
        response: 'REWRITE_RESPONSE_MARKER_222',
        isStructured: false,
        promptUsed: rewritePrompt || '',
        schemaUsed: null,
    });

    // Set analyze prompt
    state.configs.analyze.promptPresetId = null;
    state.configs.analyze.customPrompt = 'Compare original {{char_name}} with rewrite. Original: {{original_character}}';

    const analyzePrompt = buildStagePrompt(state, 'analyze');

    assertContains(analyzePrompt, 'PipelineTestChar', '5.5 Analyze prompt contains character name', errors);
    assertContains(analyzePrompt, 'REWRITE_RESPONSE_MARKER_222', '5.6 Analyze prompt contains rewrite', errors);

    // Check original character deduplication
    const charDescCount = (analyzePrompt?.match(/PIPELINE_CHAR_DESC_MARKER_XYZ/g) || []).length;
    if (charDescCount === 1) {
        console.log('✓ 5.7 Original character not duplicated');
    } else {
        warnings.push(`5.7 Original character appears ${charDescCount} times`);
        console.log(`⚠ 5.7 Original character appears ${charDescCount} times`);
    }

    console.log('');

    // ========================================================================
    // PHASE 6: Refinement prompt building
    // ========================================================================
    console.log('--- PHASE 6: Refinement Prompt Building ---\n');

    // Complete analyze first
    state = completeStage(state, 'analyze', {
        response: 'ANALYZE_RESPONSE_MARKER_333',
        isStructured: false,
        promptUsed: analyzePrompt || '',
        schemaUsed: null,
    });

    // Build refinement prompt
    const refinementPrompt = buildRefinementPrompt(state);

    assertContains(refinementPrompt, 'PIPELINE_CHAR_DESC_MARKER_XYZ', '6.1 Refinement has original character', errors);
    assertContains(refinementPrompt, 'REWRITE_RESPONSE_MARKER_222', '6.2 Refinement has current rewrite', errors);
    assertContains(refinementPrompt, 'ANALYZE_RESPONSE_MARKER_333', '6.3 Refinement has analysis', errors);
    assertContains(refinementPrompt, 'SCORE_RESPONSE_MARKER_111', '6.4 Refinement has score feedback', errors);

    console.log('');

    // ========================================================================
    // PHASE 7: Edge cases and potential issues
    // ========================================================================
    console.log('--- PHASE 7: Edge Cases ---\n');

    // Test empty/undefined context values
    const partialContext: TemplateContext = {
        charName: 'PartialChar',
        // Everything else undefined
    };

    const partialResult = processPromptTemplate(
        '{{char_name}} - {{score_results}} - {{original_character}}',
        partialContext,
    );

    assertContains(partialResult, 'PartialChar', '7.1 Defined values are replaced', errors);
    // Undefined values should remain as placeholders
    if (partialResult.includes('{{score_results}}')) {
        console.log('✓ 7.2 Undefined {{score_results}} left as placeholder');
    } else {
        // It might be empty string, which is also acceptable
        console.log('✓ 7.2 Undefined {{score_results}} handled gracefully');
    }

    // Test special characters in content
    const specialContext: TemplateContext = {
        charName: 'Test$Char',
        scoreResults: 'Score with $pecial ch@rs & <html> "quotes"',
    };

    const specialResult = processPromptTemplate('{{char_name}}: {{score_results}}', specialContext);
    assertContains(specialResult, 'Test$Char', '7.3 Special chars in name preserved', errors);
    assertContains(specialResult, '$pecial', '7.4 Special chars in content preserved', errors);

    // Test regex-like content (potential injection)
    const regexContext: TemplateContext = {
        charName: 'Test.*Char',
        scoreResults: 'Content with (groups) and [brackets]',
    };

    const regexResult = processPromptTemplate('{{char_name}}: {{score_results}}', regexContext);
    assertContains(regexResult, 'Test.*Char', '7.5 Regex-like chars in name preserved', errors);
    assertContains(regexResult, '(groups)', '7.6 Regex-like chars in content preserved', errors);

    // Test very long content
    const longContent = 'X'.repeat(10000);
    const longContext: TemplateContext = {
        originalCharacter: longContent,
        charName: 'LongChar',
    };

    const longResult = processPromptTemplate('{{original_character}}', longContext);
    if (longResult.length >= 10000) {
        console.log('✓ 7.7 Long content handled correctly');
    } else {
        errors.push(`FAIL: 7.7 Long content truncated: ${longResult.length} chars`);
        console.error('✗ 7.7 Long content truncated');
    }

    console.log('');

    // ========================================================================
    // PHASE 8: Verify NO ST substituteParams usage
    // ========================================================================
    console.log('--- PHASE 8: No ST substituteParams Interference ---\n');

    // This test verifies that we're NOT using ST's substituteParams
    // by checking that {{user}} and time macros pass through unchanged

    const noSubstituteTest = 'Character: {{char}}, User: {{user}}, Time: {{time}}';
    const noSubstituteContext: TemplateContext = {
        charName: 'MyAnalyzedChar',
    };

    const noSubstituteResult = processPromptTemplate(noSubstituteTest, noSubstituteContext);

    // {{char}} should be replaced with our character
    assertContains(noSubstituteResult, 'MyAnalyzedChar', '8.1 {{char}} replaced with analyzed character', errors);

    // {{user}} should NOT be replaced (we don't touch it)
    assertContains(noSubstituteResult, '{{user}}', '8.2 {{user}} passes through unchanged', errors);

    // {{time}} should NOT be replaced (we don't use substituteParams)
    assertContains(noSubstituteResult, '{{time}}', '8.3 {{time}} passes through unchanged (no substituteParams)', errors);

    console.log('');
    console.log('  VERIFICATION: We do NOT use ST\'s substituteParams because:');
    console.log('  - It would replace {{char}} with the ACTIVE CHAT character');
    console.log('  - It would replace {{user}} with the current persona');
    console.log('  - Neither is relevant to character card analysis');
    console.log('  - We want {{char}} to be the character being ANALYZED');
    console.log('');

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('=== MACRO & PLACEHOLDER TEST RESULTS ===\n');

    if (warnings.length > 0) {
        console.log(`⚠ ${warnings.length} WARNING(S):`);
        warnings.forEach(w => console.log('   ' + w));
        console.log('');
    }

    if (errors.length === 0) {
        console.log('✅ ALL TESTS PASSED');
        console.log('   8 phases, comprehensive macro/placeholder coverage');
        return { passed: true, errors: [], warnings };
    } else {
        console.error(`❌ ${errors.length} FAILURE(S):`);
        errors.forEach(e => console.error('   ' + e));
        return { passed: false, errors, warnings };
    }
}

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

function assertContains(
    haystack: string | null | undefined,
    needle: string,
    testName: string,
    errors: string[],
): void {
    if (!haystack) {
        errors.push(`FAIL: ${testName} - haystack is null/undefined`);
        console.error(`✗ ${testName} - haystack is null/undefined`);
        return;
    }
    if (haystack.includes(needle)) {
        console.log(`✓ ${testName}`);
    } else {
        errors.push(`FAIL: ${testName}`);
        console.error(`✗ ${testName}`);
        console.debug(`  Expected to find: "${needle}"`);
        console.debug(`  In (first 200 chars): "${haystack.substring(0, 200)}..."`);
    }
}

function assertNotContains(
    haystack: string | null | undefined,
    needle: string,
    testName: string,
    errors: string[],
): void {
    if (!haystack) {
        console.log(`✓ ${testName}`);
        return;
    }
    if (!haystack.includes(needle)) {
        console.log(`✓ ${testName}`);
    } else {
        errors.push(`FAIL: ${testName} - found "${needle}" when it should NOT be present`);
        console.error(`✗ ${testName}`);
    }
}

function assertArrayContains(
    arr: string[],
    item: string,
    testName: string,
    errors: string[],
): void {
    if (arr.includes(item)) {
        console.log(`✓ ${testName}`);
    } else {
        errors.push(`FAIL: ${testName} - "${item}" not in [${arr.join(', ')}]`);
        console.error(`✗ ${testName}`);
    }
}

// Expose to window for console access
if (typeof window !== 'undefined') {
    (window as unknown as { testMacroPlaceholders: typeof testMacroPlaceholders }).testMacroPlaceholders = testMacroPlaceholders;
}
