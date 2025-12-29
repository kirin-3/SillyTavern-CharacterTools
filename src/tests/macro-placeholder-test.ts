// src/tests/macro-placeholder-test.ts

import { processPromptTemplate, promptHasPlaceholders } from '../presets';
import { buildStagePrompt, buildRefinementPrompt, createPipelineState, setCharacter, completeStage, startRefinement, initializeFieldSelection } from '../pipeline';
import type { Character, TemplateContext } from '../types';

/**
 * Comprehensive test for macro and placeholder handling.
 *
 * Tests:
 * 1. Our custom placeholders ({{original_character}}, {{score_results}}, etc.)
 * 2. ST's substituteParams behavior
 * 3. {{char}} and {{user}} handling (ST replaces these - we should NOT use them)
 * 4. Our {{char_name}} and {{user_name}} placeholders
 * 5. Conditional blocks
 * 6. Placeholder detection
 * 7. Full pipeline prompt building with deduplication
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
        User name: {{user_name}}
    `;

    const detected = promptHasPlaceholders(testPrompt1);

    assertArrayContains(detected, 'ORIGINAL_CHARACTER', '1.1 Detects {{original_character}}', errors);
    assertArrayContains(detected, 'SCORE_RESULTS', '1.2 Detects {{score_results}}', errors);
    assertArrayContains(detected, 'CURRENT_REWRITE', '1.3 Detects {{current_rewrite}}', errors);
    assertArrayContains(detected, 'CURRENT_ANALYSIS', '1.4 Detects {{current_analysis}}', errors);
    assertArrayContains(detected, 'ITERATION_NUMBER', '1.5 Detects {{iteration_number}}', errors);
    assertArrayContains(detected, 'CHARACTER_NAME', '1.6 Detects {{char_name}}', errors);
    assertArrayContains(detected, 'USER_NAME', '1.7 Detects {{user_name}}', errors);

    // Test that we DON'T detect {{char}} and {{user}} as our placeholders
    const testPrompt2 = 'Hello {{char}}, I am {{user}}';
    const detected2 = promptHasPlaceholders(testPrompt2);

    if (detected2.length > 0) {
        // This might be okay if we're detecting them, but we should warn
        warnings.push('1.8 {{char}} and {{user}} detected as placeholders - these are ST macros, not ours');
        console.log(`⚠ 1.8 {{char}}/{{user}} detected: ${detected2.join(', ')}`);
    } else {
        console.log('✓ 1.8 {{char}} and {{user}} correctly NOT detected as our placeholders');
    }

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
        userName: 'TestUser',
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
        { input: 'User: {{user_name}}', expected: 'TestUser', name: '2.8 {{user_name}}' },
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
    // PHASE 3: ST's substituteParams behavior
    // ========================================================================
    console.log('--- PHASE 3: ST substituteParams Behavior ---\n');

    const { substituteParams, name1, name2, chat, characterId } = SillyTavern.getContext();

    console.log(`  Current ST context: name1="${name1}", name2="${name2}", hasChat=${!!chat?.length}, characterId=${characterId}`);

    // Test what ST does with {{char}} and {{user}}
    const stCharResult = substituteParams('Hello {{char}}');
    const stUserResult = substituteParams('Hello {{user}}');

    console.log(`  ST {{char}} -> "${stCharResult}"`);
    console.log(`  ST {{user}} -> "${stUserResult}"`);

    // Check if ST replaced them or left them alone
    if (stCharResult.includes('{{char}}')) {
        console.log('✓ 3.1 ST left {{char}} unreplaced (no active chat context)');
    } else {
        warnings.push(`3.1 ST replaced {{char}} with "${stCharResult.replace('Hello ', '')}" - this may cause issues`);
        console.log('⚠ 3.1 ST replaced {{char}} - active chat context exists');
    }

    if (stUserResult.includes('{{user}}')) {
        console.log('✓ 3.2 ST left {{user}} unreplaced (no active chat context)');
    } else {
        warnings.push(`3.2 ST replaced {{user}} with "${stUserResult.replace('Hello ', '')}" - this may cause issues`);
        console.log('⚠ 3.2 ST replaced {{user}} - active chat context exists');
    }

    // Test that ST doesn't touch our custom placeholders
    const stCustomResult = substituteParams('Test {{char_name}} and {{original_character}}');
    assertContains(stCustomResult, '{{char_name}}', '3.3 ST leaves {{char_name}} alone', errors);
    assertContains(stCustomResult, '{{original_character}}', '3.4 ST leaves {{original_character}} alone', errors);

    // Test ST's time/date macros (these should work)
    const stTimeResult = substituteParams('Time: {{time}}');
    if (!stTimeResult.includes('{{time}}')) {
        console.log('✓ 3.5 ST replaces {{time}} macro');
    } else {
        warnings.push('3.5 ST did not replace {{time}} - may be disabled');
        console.log('⚠ 3.5 ST did not replace {{time}}');
    }

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
        userName: 'User',
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
    // Undefined values should remain as placeholders or be empty
    if (partialResult.includes('{{score_results}}') || !partialResult.includes('SCORE')) {
        console.log('✓ 7.2 Undefined {{score_results}} handled gracefully');
    } else {
        warnings.push('7.2 Undefined placeholder handling unclear');
        console.log(`⚠ 7.2 Result: "${partialResult}"`);
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
    // PHASE 8: {{char}} and {{user}} - The Problem Children
    // ========================================================================
    console.log('--- PHASE 8: {{char}} and {{user}} Behavior ---\n');

    // These are ST macros that get replaced by substituteParams BEFORE our code runs
    // We need to document this behavior

    const charUserPrompt = 'Hello {{char}}, I am {{user}}. Character: {{char_name}}';
    const charUserContext: TemplateContext = {
        charName: 'AnalyzedCharacter',
        userName: 'AnalyzingUser',
    };

    const charUserResult = processPromptTemplate(charUserPrompt, charUserContext);

    console.log(`  Input: "${charUserPrompt}"`);
    console.log(`  Output: "${charUserResult}"`);

    // Check what happened to {{char}} and {{user}}
    if (charUserResult.includes('{{char}}')) {
        console.log('✓ 8.1 {{char}} left unreplaced (no active chat) - SAFE');
    } else if (charUserResult.includes('AnalyzedCharacter') && !charUserResult.includes('{{char_name}}')) {
        // Our code might be replacing {{char}} - this is the bug we're looking for
        errors.push('FAIL: 8.1 {{char}} was replaced - check if our code is doing this');
        console.error('✗ 8.1 {{char}} was replaced unexpectedly');
    } else {
        warnings.push('8.1 {{char}} replaced by ST with active chat character');
        console.log('⚠ 8.1 {{char}} replaced by ST (active chat exists)');
    }

    // Verify {{char_name}} works correctly regardless
    assertContains(charUserResult, 'AnalyzedCharacter', '8.2 {{char_name}} replaced correctly', errors);

    // Document the recommendation
    console.log('');
    console.log('  RECOMMENDATION:');
    console.log('  - Use {{char_name}} for the analyzed character name');
    console.log('  - Use {{user_name}} for the user name');
    console.log('  - Avoid {{char}} and {{user}} - they reference active chat, not analyzed character');

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
