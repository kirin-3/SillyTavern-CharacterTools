// src/tests/session-persistence-test.ts

import {
    createPipelineState,
    setCharacter,
    completeStage,
    startRefinement,
    completeRefinement,
    initializeFieldSelection,
    updateFieldSelection,
    selectAllFields,
    deselectAllFields,
    updateStageConfig,
    extractVerdict,
} from '../core/pipeline';
import {
    loadCharacterSessions,
    saveSession,
    getSession,
    renameSession,
    deleteSession,
    deleteAllCharacterSessions,
    restorePipelineFromSession,
    setActiveSession,
    getCharacterKey,
    hasAnySessions,
    getSessionCount,
} from '../core/persistence';
import { createStageConfigFromDefaults } from '../core/presets';
import type { Character, PipelineState, FieldSelection, StageConfig } from '../types';

/**
 * Comprehensive test for session persistence, field selection, and state management.
 *
 * Tests:
 * 1. Field selection logic
 * 2. Session save/load cycle
 * 3. State restoration accuracy
 * 4. Multiple sessions per character
 * 5. Session operations (rename, delete)
 * 6. Edge cases and error handling
 * 7. Character switching behavior
 * 8. Iteration history persistence
 *
 * Run from console: window.testSessionPersistence()
 */
export async function testSessionPersistence(): Promise<{
    passed: boolean;
    errors: string[];
    warnings: string[];
}> {
    const errors: string[] = [];
    const warnings: string[] = [];

    console.log('=== SESSION PERSISTENCE TEST ===\n');

    // Create mock characters
    const mockChar1: Character = {
        name: 'SessionTestChar1',
        avatar: 'session_test_1.png',
        description: 'SESSION_CHAR1_DESC_MARKER',
        personality: 'Test personality 1',
        first_mes: 'Hello from char 1',
        mes_example: 'Example messages here',
        scenario: 'Test scenario',
        data: {
            alternate_greetings: ['Alt greeting 1', 'Alt greeting 2', 'Alt greeting 3'],
            system_prompt: 'System prompt content',
        },
    };

    const mockChar2: Character = {
        name: 'SessionTestChar2',
        avatar: 'session_test_2.png',
        description: 'SESSION_CHAR2_DESC_MARKER',
        personality: 'Test personality 2',
        first_mes: 'Hello from char 2',
        mes_example: '',
        scenario: '',
    };

    // Clean up any existing test sessions
    await deleteAllCharacterSessions(mockChar1);
    await deleteAllCharacterSessions(mockChar2);

    // ========================================================================
    // PHASE 1: Field Selection Logic
    // ========================================================================
    console.log('--- PHASE 1: Field Selection Logic ---\n');

    let state = createPipelineState();
    state = setCharacter(state, mockChar1, 0);

    // 1.1: Initial field selection should include all populated fields
    const initialSelection = state.selectedFields;

    assertFieldSelected(initialSelection, 'description', true, '1.1 Description selected by default', errors);
    assertFieldSelected(initialSelection, 'personality', true, '1.2 Personality selected by default', errors);
    assertFieldSelected(initialSelection, 'first_mes', true, '1.3 First message selected by default', errors);
    assertFieldSelected(initialSelection, 'mes_example', true, '1.4 Example messages selected by default', errors);
    assertFieldSelected(initialSelection, 'scenario', true, '1.5 Scenario selected by default', errors);

    // 1.2: Alt greetings should have all indices selected
    const altGreetingsSelection = initialSelection['alternate_greetings'];
    if (Array.isArray(altGreetingsSelection)) {
        assertEqual(altGreetingsSelection.length, 3, '1.6 All 3 alt greetings selected', errors);
        assertArrayContains(altGreetingsSelection, 0, '1.7 Alt greeting 0 selected', errors);
        assertArrayContains(altGreetingsSelection, 1, '1.8 Alt greeting 1 selected', errors);
        assertArrayContains(altGreetingsSelection, 2, '1.9 Alt greeting 2 selected', errors);
    } else {
        errors.push('FAIL: 1.6 Alt greetings should be an array');
    }

    // 1.3: Update individual field selection
    state = updateFieldSelection(state, 'description', false);
    assertFieldSelected(state.selectedFields, 'description', false, '1.10 Description deselected', errors);
    assertFieldSelected(state.selectedFields, 'personality', true, '1.11 Other fields unchanged', errors);

    // 1.4: Update alt greeting selection (partial)
    state = updateFieldSelection(state, 'alternate_greetings', [0, 2]);
    const partialAltSelection = state.selectedFields['alternate_greetings'];
    if (Array.isArray(partialAltSelection)) {
        assertEqual(partialAltSelection.length, 2, '1.12 Only 2 alt greetings selected', errors);
        assertArrayContains(partialAltSelection, 0, '1.13 Alt greeting 0 still selected', errors);
        assertArrayNotContains(partialAltSelection, 1, '1.14 Alt greeting 1 deselected', errors);
        assertArrayContains(partialAltSelection, 2, '1.15 Alt greeting 2 still selected', errors);
    } else {
        errors.push('FAIL: 1.12 Alt greetings should be an array');
    }

    // 1.5: Select all fields
    state = selectAllFields(state);
    assertFieldSelected(state.selectedFields, 'description', true, '1.16 Description re-selected via selectAll', errors);

    // 1.6: Deselect all fields
    state = deselectAllFields(state);
    const emptySelection = Object.values(state.selectedFields).filter(v =>
        v === true || (Array.isArray(v) && v.length > 0),
    );
    assertEqual(emptySelection.length, 0, '1.17 All fields deselected', errors);

    // Restore selection for further tests
    state = selectAllFields(state);

    console.log('');

    // ========================================================================
    // PHASE 2: Basic Session Save/Load
    // ========================================================================
    console.log('--- PHASE 2: Basic Session Save/Load ---\n');

    // 2.1: Save empty session
    const emptySessionId = await saveSession(mockChar1, state, undefined, 'Empty Session');
    assertTruthy(emptySessionId, '2.1 Empty session saved successfully', errors);

    // 2.2: Verify session exists
    const hasSession = await hasAnySessions(mockChar1);
    assertEqual(hasSession, true, '2.2 Character has sessions', errors);

    const sessionCount = await getSessionCount(mockChar1);
    assertEqual(sessionCount, 1, '2.3 Session count is 1', errors);

    // 2.3: Load session data
    const loadedData = await loadCharacterSessions(mockChar1);
    assertEqual(loadedData.sessions.length, 1, '2.4 Loaded 1 session', errors);
    assertEqual(loadedData.activeSessionId, emptySessionId, '2.5 Active session ID matches', errors);
    assertEqual(loadedData.characterName, mockChar1.name, '2.6 Character name matches', errors);

    // 2.4: Get specific session
    const retrievedSession = await getSession(mockChar1, emptySessionId);
    assertTruthy(retrievedSession, '2.7 Retrieved session exists', errors);
    assertEqual(retrievedSession?.label, 'Empty Session', '2.8 Session label matches', errors);

    console.log('');

    // ========================================================================
    // PHASE 3: Session with Results
    // ========================================================================
    console.log('--- PHASE 3: Session with Results ---\n');

    // Build up state with results
    state = createPipelineState();
    state = setCharacter(state, mockChar1, 0);

    // Complete score
    state = completeStage(state, 'score', {
        response: 'SCORE_PERSIST_MARKER_AAA111',
        isStructured: false,
        promptUsed: 'Score prompt',
        schemaUsed: null,
    });

    // Complete rewrite
    state = completeStage(state, 'rewrite', {
        response: 'REWRITE_PERSIST_MARKER_BBB222',
        isStructured: true,
        promptUsed: 'Rewrite prompt',
        schemaUsed: { name: 'TestSchema', strict: true, value: { type: 'object' } },
    });

    // Complete analyze
    state = completeStage(state, 'analyze', {
        response: 'ANALYZE_PERSIST_MARKER_CCC333 - Verdict: NEEDS_REFINEMENT',
        isStructured: false,
        promptUsed: 'Analyze prompt',
        schemaUsed: null,
    });

    // Modify stage config
    state = updateStageConfig(state, 'score', {
        promptPresetId: null,
        customPrompt: 'CUSTOM_PROMPT_MARKER_DDD444',
        useStructuredOutput: true,
    });

    // Modify field selection
    state = updateFieldSelection(state, 'scenario', false);
    state = updateFieldSelection(state, 'alternate_greetings', [1]);

    // Save session with results
    const resultsSessionId = await saveSession(mockChar1, state, undefined, 'Results Session');
    assertTruthy(resultsSessionId, '3.1 Results session saved', errors);

    // 3.2: Load and verify
    const resultsData = await loadCharacterSessions(mockChar1);
    assertEqual(resultsData.sessions.length, 2, '3.2 Now have 2 sessions', errors);

    const resultsSession = resultsData.sessions.find(s => s.id === resultsSessionId);
    assertTruthy(resultsSession, '3.3 Results session found', errors);

    // 3.3: Verify results persisted
    assertContains(resultsSession?.results.score?.response, 'SCORE_PERSIST_MARKER_AAA111',
        '3.4 Score result persisted', errors);
    assertContains(resultsSession?.results.rewrite?.response, 'REWRITE_PERSIST_MARKER_BBB222',
        '3.5 Rewrite result persisted', errors);
    assertContains(resultsSession?.results.analyze?.response, 'ANALYZE_PERSIST_MARKER_CCC333',
        '3.6 Analyze result persisted', errors);

    // 3.4: Verify structured output flag
    assertEqual(resultsSession?.results.rewrite?.isStructured, true, '3.7 isStructured flag persisted', errors);

    // 3.5: Verify config persisted
    assertContains(resultsSession?.configs.score.customPrompt, 'CUSTOM_PROMPT_MARKER_DDD444',
        '3.8 Custom prompt persisted', errors);
    assertEqual(resultsSession?.configs.score.useStructuredOutput, true, '3.9 useStructuredOutput persisted', errors);

    // 3.6: Verify field selection persisted
    assertEqual(resultsSession?.selectedFields.scenario, false, '3.10 Scenario deselection persisted', errors);
    const persistedAltGreetings = resultsSession?.selectedFields.alternate_greetings;
    if (Array.isArray(persistedAltGreetings)) {
        assertEqual(persistedAltGreetings.length, 1, '3.11 Alt greetings selection persisted', errors);
        assertEqual(persistedAltGreetings[0], 1, '3.12 Correct alt greeting index persisted', errors);
    } else {
        errors.push('FAIL: 3.11 Alt greetings should be array');
    }

    console.log('');

    // ========================================================================
    // PHASE 4: State Restoration
    // ========================================================================
    console.log('--- PHASE 4: State Restoration ---\n');

    // 4.1: Restore pipeline from session
    const restoredPipeline = restorePipelineFromSession(resultsSession!, mockChar1, 0);

    // 4.2: Verify character restored
    assertEqual(restoredPipeline.character?.name, mockChar1.name, '4.1 Character restored', errors);
    assertEqual(restoredPipeline.characterIndex, 0, '4.2 Character index restored', errors);

    // 4.3: Verify results restored
    assertContains(restoredPipeline.results.score?.response, 'SCORE_PERSIST_MARKER_AAA111',
        '4.3 Score result restored', errors);
    assertContains(restoredPipeline.results.rewrite?.response, 'REWRITE_PERSIST_MARKER_BBB222',
        '4.4 Rewrite result restored', errors);
    assertContains(restoredPipeline.results.analyze?.response, 'ANALYZE_PERSIST_MARKER_CCC333',
        '4.5 Analyze result restored', errors);

    // 4.4: Verify stage status restored
    assertEqual(restoredPipeline.stageStatus.score, 'complete', '4.6 Score status restored', errors);
    assertEqual(restoredPipeline.stageStatus.rewrite, 'complete', '4.7 Rewrite status restored', errors);
    assertEqual(restoredPipeline.stageStatus.analyze, 'complete', '4.8 Analyze status restored', errors);

    // 4.5: Verify config restored
    assertContains(restoredPipeline.configs.score.customPrompt, 'CUSTOM_PROMPT_MARKER_DDD444',
        '4.9 Config restored', errors);

    // 4.6: Verify field selection restored
    assertEqual(restoredPipeline.selectedFields.scenario, false, '4.10 Field selection restored', errors);

    console.log('');

    // ========================================================================
    // PHASE 5: Iteration History Persistence
    // ========================================================================
    console.log('--- PHASE 5: Iteration History Persistence ---\n');

    // Build state with iterations
    state = createPipelineState();
    state = setCharacter(state, mockChar1, 0);

    // Complete initial rewrite
    state = completeStage(state, 'rewrite', {
        response: 'ITERATION_REWRITE_V1_MARKER',
        isStructured: false,
        promptUsed: 'Rewrite prompt',
        schemaUsed: null,
    });

    // Complete initial analyze
    state = completeStage(state, 'analyze', {
        response: 'ITERATION_ANALYZE_V1_MARKER - Verdict: NEEDS_REFINEMENT',
        isStructured: false,
        promptUsed: 'Analyze prompt',
        schemaUsed: null,
    });

    // Start refinement (creates history entry)
    state = startRefinement(state);

    // Complete refinement
    state = completeRefinement(state, {
        response: 'ITERATION_REWRITE_V2_MARKER',
        isStructured: false,
        promptUsed: 'Refinement prompt',
        schemaUsed: null,
    });

    // Complete second analyze
    state = completeStage(state, 'analyze', {
        response: 'ITERATION_ANALYZE_V2_MARKER - Verdict: ACCEPT',
        isStructured: false,
        promptUsed: 'Analyze prompt',
        schemaUsed: null,
    });

    // 5.1: Verify iteration state before save
    assertEqual(state.iterationCount, 1, '5.1 Iteration count is 1', errors);
    assertEqual(state.iterationHistory.length, 1, '5.2 History has 1 entry', errors);
    assertContains(state.iterationHistory[0].rewriteResponse, 'ITERATION_REWRITE_V1_MARKER',
        '5.3 History contains V1 rewrite', errors);

    // 5.2: Save session with iterations
    const iterationSessionId = await saveSession(mockChar1, state, undefined, 'Iteration Session');

    // 5.3: Load and verify
    const iterationSession = await getSession(mockChar1, iterationSessionId);
    assertEqual(iterationSession?.iterationCount, 1, '5.4 Iteration count persisted', errors);
    assertEqual(iterationSession?.iterationHistory.length, 1, '5.5 History length persisted', errors);

    // 5.4: Verify history content
    assertContains(iterationSession?.iterationHistory[0].rewriteResponse, 'ITERATION_REWRITE_V1_MARKER',
        '5.6 History rewrite persisted', errors);
    assertContains(iterationSession?.iterationHistory[0].analysisResponse, 'ITERATION_ANALYZE_V1_MARKER',
        '5.7 History analysis persisted', errors);

    // 5.5: Verify verdict extraction
    const verdict = iterationSession?.iterationHistory[0].verdict;
    assertEqual(verdict, 'needs_refinement', '5.8 Verdict extracted correctly', errors);

    // 5.6: Restore and verify
    const restoredIterationPipeline = restorePipelineFromSession(iterationSession!, mockChar1, 0);
    assertEqual(restoredIterationPipeline.iterationCount, 1, '5.9 Iteration count restored', errors);
    assertEqual(restoredIterationPipeline.iterationHistory.length, 1, '5.10 History restored', errors);
    assertContains(restoredIterationPipeline.results.rewrite?.response, 'ITERATION_REWRITE_V2_MARKER',
        '5.11 Current rewrite is V2 (not V1)', errors);

    console.log('');

    // ========================================================================
    // PHASE 6: Session Operations
    // ========================================================================
    console.log('--- PHASE 6: Session Operations ---\n');

    // 6.1: Rename session
    const renamed = await renameSession(mockChar1, emptySessionId, 'Renamed Empty Session');
    assertEqual(renamed, true, '6.1 Rename succeeded', errors);

    const renamedSession = await getSession(mockChar1, emptySessionId);
    assertEqual(renamedSession?.label, 'Renamed Empty Session', '6.2 New label applied', errors);

    // 6.2: Set active session
    await setActiveSession(mockChar1, resultsSessionId);
    const afterSetActive = await loadCharacterSessions(mockChar1);
    assertEqual(afterSetActive.activeSessionId, resultsSessionId, '6.3 Active session changed', errors);

    // 6.3: Delete session
    const deleted = await deleteSession(mockChar1, emptySessionId);
    assertEqual(deleted, true, '6.4 Delete succeeded', errors);

    const afterDelete = await loadCharacterSessions(mockChar1);
    assertEqual(afterDelete.sessions.length, 2, '6.5 Session count decreased', errors);

    const deletedSession = afterDelete.sessions.find(s => s.id === emptySessionId);
    assertEqual(deletedSession, undefined, '6.6 Deleted session not found', errors);

    // 6.4: Delete active session (should update active)
    await setActiveSession(mockChar1, resultsSessionId);
    await deleteSession(mockChar1, resultsSessionId);

    const afterDeleteActive = await loadCharacterSessions(mockChar1);
    // Active should be updated to remaining session or null
    if (afterDeleteActive.sessions.length > 0) {
        assertTruthy(afterDeleteActive.activeSessionId, '6.7 Active session updated after delete', errors);
    }

    console.log('');

    // ========================================================================
    // PHASE 7: Multiple Characters
    // ========================================================================
    console.log('--- PHASE 7: Multiple Characters ---\n');

    // 7.1: Verify character keys are different
    const key1 = getCharacterKey(mockChar1);
    const key2 = getCharacterKey(mockChar2);
    assertNotEqual(key1, key2, '7.1 Character keys are unique', errors);

    // 7.2: Save session for char2
    let state2 = createPipelineState();
    state2 = setCharacter(state2, mockChar2, 1);
    state2 = completeStage(state2, 'score', {
        response: 'CHAR2_SCORE_MARKER',
        isStructured: false,
        promptUsed: 'Score prompt',
        schemaUsed: null,
    });

    const char2SessionId = await saveSession(mockChar2, state2, undefined, 'Char2 Session');

    // 7.3: Verify sessions are isolated
    const char1Sessions = await loadCharacterSessions(mockChar1);
    const char2Sessions = await loadCharacterSessions(mockChar2);

    // Char1 should not have char2's session
    const char1HasChar2Session = char1Sessions.sessions.some(s =>
        s.results.score?.response?.includes('CHAR2_SCORE_MARKER'),
    );
    assertEqual(char1HasChar2Session, false, '7.2 Char1 sessions isolated from char2', errors);

    // Char2 should have its session
    const char2HasOwnSession = char2Sessions.sessions.some(s =>
        s.results.score?.response?.includes('CHAR2_SCORE_MARKER'),
    );
    assertEqual(char2HasOwnSession, true, '7.3 Char2 has its own session', errors);

    // 7.4: Delete all for one character doesn't affect other
    await deleteAllCharacterSessions(mockChar2);

    const char1AfterChar2Delete = await loadCharacterSessions(mockChar1);
    const char2AfterDelete = await loadCharacterSessions(mockChar2);

    assertEqual(char2AfterDelete.sessions.length, 0, '7.4 Char2 sessions deleted', errors);
    assertTruthy(char1AfterChar2Delete.sessions.length > 0, '7.5 Char1 sessions unaffected', errors);

    console.log('');

    // ========================================================================
    // PHASE 8: Edge Cases
    // ========================================================================
    console.log('--- PHASE 8: Edge Cases ---\n');

    // 8.1: Save same session multiple times (update)
    state = createPipelineState();
    state = setCharacter(state, mockChar1, 0);

    const updateSessionId = await saveSession(mockChar1, state, undefined, 'Update Test');

    state = completeStage(state, 'score', {
        response: 'UPDATED_SCORE_MARKER',
        isStructured: false,
        promptUsed: 'Score prompt',
        schemaUsed: null,
    });

    // Save with same ID should update
    await saveSession(mockChar1, state, updateSessionId, 'Update Test');

    const updatedSession = await getSession(mockChar1, updateSessionId);
    assertContains(updatedSession?.results.score?.response, 'UPDATED_SCORE_MARKER',
        '8.1 Session updated in place', errors);

    // 8.2: Get non-existent session
    const nonExistent = await getSession(mockChar1, 'non_existent_id_12345');
    assertEqual(nonExistent, null, '8.2 Non-existent session returns null', errors);

    // 8.3: Delete non-existent session
    const deleteNonExistent = await deleteSession(mockChar1, 'non_existent_id_12345');
    assertEqual(deleteNonExistent, false, '8.3 Delete non-existent returns false', errors);

    // 8.4: Rename non-existent session
    const renameNonExistent = await renameSession(mockChar1, 'non_existent_id_12345', 'New Name');
    assertEqual(renameNonExistent, false, '8.4 Rename non-existent returns false', errors);

    // 8.5: Empty label handling
    const emptyLabelId = await saveSession(mockChar1, state, undefined, '');
    const emptyLabelSession = await getSession(mockChar1, emptyLabelId);
    assertTruthy(emptyLabelSession?.label, '8.5 Empty label gets default', errors);

    // 8.6: Very long label
    const longLabel = 'A'.repeat(500);
    const longLabelId = await saveSession(mockChar1, state, undefined, longLabel);
    const longLabelSession = await getSession(mockChar1, longLabelId);
    assertEqual(longLabelSession?.label, longLabel, '8.6 Long label preserved', errors);

    // 8.7: Special characters in label
    const specialLabel = 'Test <script>alert("xss")</script> & "quotes" \'apostrophe\'';
    const specialLabelId = await saveSession(mockChar1, state, undefined, specialLabel);
    const specialLabelSession = await getSession(mockChar1, specialLabelId);
    assertEqual(specialLabelSession?.label, specialLabel, '8.7 Special chars in label preserved', errors);

    console.log('');

    // ========================================================================
    // PHASE 9: Verdict Extraction
    // ========================================================================
    console.log('--- PHASE 9: Verdict Extraction ---\n');

    const verdictTests = [
        { input: 'Verdict: ACCEPT', expected: 'accept', name: '9.1 ACCEPT verdict' },
        { input: 'Verdict: NEEDS_REFINEMENT', expected: 'needs_refinement', name: '9.2 NEEDS_REFINEMENT verdict' },
        { input: 'Verdict: REGRESSION', expected: 'regression', name: '9.3 REGRESSION verdict' },
        { input: '"verdict": "ACCEPT"', expected: 'accept', name: '9.4 JSON format ACCEPT' },
        { input: '"verdict": "NEEDS_REFINEMENT"', expected: 'needs_refinement', name: '9.5 JSON format NEEDS_REFINEMENT' },
        { input: 'Ready to use, no more iterations needed', expected: 'accept', name: '9.6 Implicit accept' },
        { input: 'This is worse than before, step backward', expected: 'regression', name: '9.7 Implicit regression' },
        { input: 'There are still issues to fix', expected: 'needs_refinement', name: '9.8 Implicit needs_refinement' },
        { input: 'Some random text without verdict', expected: 'needs_refinement', name: '9.9 Default to needs_refinement' },
    ];

    for (const test of verdictTests) {
        const result = extractVerdict(test.input);
        assertEqual(result, test.expected, test.name, errors);
    }

    console.log('');

    // ========================================================================
    // CLEANUP
    // ========================================================================
    console.log('--- CLEANUP ---\n');

    await deleteAllCharacterSessions(mockChar1);
    await deleteAllCharacterSessions(mockChar2);

    const finalCount1 = await getSessionCount(mockChar1);
    const finalCount2 = await getSessionCount(mockChar2);

    assertEqual(finalCount1, 0, 'Cleanup: Char1 sessions cleared', errors);
    assertEqual(finalCount2, 0, 'Cleanup: Char2 sessions cleared', errors);

    console.log('');

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('=== SESSION PERSISTENCE TEST RESULTS ===\n');

    if (warnings.length > 0) {
        console.log(`⚠ ${warnings.length} WARNING(S):`);
        warnings.forEach(w => console.log('   ' + w));
        console.log('');
    }

    if (errors.length === 0) {
        console.log('✅ ALL TESTS PASSED');
        console.log('   9 phases, comprehensive session/persistence coverage');
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

function assertEqual<T>(actual: T, expected: T, testName: string, errors: string[]): void {
    if (actual === expected) {
        console.log(`✓ ${testName}`);
    } else {
        errors.push(`FAIL: ${testName} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        console.error(`✗ ${testName}`);
    }
}

function assertNotEqual<T>(actual: T, notExpected: T, testName: string, errors: string[]): void {
    if (actual !== notExpected) {
        console.log(`✓ ${testName}`);
    } else {
        errors.push(`FAIL: ${testName} - should not equal ${JSON.stringify(notExpected)}`);
        console.error(`✗ ${testName}`);
    }
}

function assertTruthy(value: unknown, testName: string, errors: string[]): void {
    if (value) {
        console.log(`✓ ${testName}`);
    } else {
        errors.push(`FAIL: ${testName} - expected truthy, got ${JSON.stringify(value)}`);
        console.error(`✗ ${testName}`);
    }
}

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
    }
}

function assertFieldSelected(
    selection: FieldSelection,
    fieldKey: string,
    expected: boolean,
    testName: string,
    errors: string[],
): void {
    const value = selection[fieldKey];
    const isSelected = value === true || (Array.isArray(value) && value.length > 0);

    if (isSelected === expected) {
        console.log(`✓ ${testName}`);
    } else {
        errors.push(`FAIL: ${testName} - expected ${expected}, got ${isSelected}`);
        console.error(`✗ ${testName}`);
    }
}

function assertArrayContains<T>(arr: T[], item: T, testName: string, errors: string[]): void {
    if (arr.includes(item)) {
        console.log(`✓ ${testName}`);
    } else {
        errors.push(`FAIL: ${testName} - ${JSON.stringify(item)} not in [${arr.join(', ')}]`);
        console.error(`✗ ${testName}`);
    }
}

function assertArrayNotContains<T>(arr: T[], item: T, testName: string, errors: string[]): void {
    if (!arr.includes(item)) {
        console.log(`✓ ${testName}`);
    } else {
        errors.push(`FAIL: ${testName} - ${JSON.stringify(item)} should not be in array`);
        console.error(`✗ ${testName}`);
    }
}

// Expose to window for console access
if (typeof window !== 'undefined') {
    (window as unknown as { testSessionPersistence: typeof testSessionPersistence }).testSessionPersistence = testSessionPersistence;
}
