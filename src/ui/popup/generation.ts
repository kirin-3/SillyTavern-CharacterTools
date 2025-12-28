// src/ui/popup/generation.ts
// All generation logic

import { STAGES, STAGE_LABELS, MODULE_NAME } from '../../constants';
import { isApiReady, runStageGeneration, runRefinementGeneration } from '../../generator';
import {
    setSelectedStages,
    startStage,
    completeStage,
    failStage,
    canRunStage,
    canRefine,
    validateRefinement,
    buildStagePrompt,
    getStageSchema,
    startRefinement,
    completeRefinement,
} from '../../pipeline';
import { saveIterationHistory } from '../../persistence';
import { getState, getElement } from './state';
import { updateAllComponents, updateStageSection, updatePipelineNav, updateResultsPanel, updateIterationIndicator, updateIterationHistory } from './updaters';
import { renderRefinementLoading } from '../components/results-panel';
import type { StageName } from '../../types';

export async function runSingleStage(stage: StageName): Promise<void> {
    const state = getState();
    if (!state || state.isGenerating || state.isRefining) return;

    if (!isApiReady()) {
        toastr.error('API is not connected');
        return;
    }

    const canRun = canRunStage(state.pipeline, stage);
    if (!canRun.canRun) {
        toastr.warning(canRun.reason || 'Cannot run this stage');
        return;
    }

    if (canRun.reason) {
        toastr.info(canRun.reason);
    }

    state.isGenerating = true;
    state.abortController = new AbortController();
    state.pipeline = startStage(state.pipeline, stage);
    updateAllComponents();

    const promptUsed = buildStagePrompt(state.pipeline, stage) || '';
    const schemaUsed = getStageSchema(state.pipeline, stage);

    try {
        const result = await runStageGeneration(
            state.pipeline,
            stage,
            state.abortController.signal,
        );

        // Re-acquire state after async
        const s = getState();
        if (!s) return;

        if (result.success) {
            s.pipeline = completeStage(s.pipeline, stage, {
                response: result.response,
                isStructured: result.isStructured,
                promptUsed,
                schemaUsed,
            });
            toastr.success(`${STAGE_LABELS[stage]} complete`);
        } else {
            s.pipeline = failStage(s.pipeline, stage, result.error);
            if (result.error !== 'Generation cancelled') {
                toastr.error(result.error);
            }
        }
    } catch (e) {
        const s = getState();
        if (s) {
            s.pipeline = failStage(s.pipeline, stage, (e as Error).message);
        }
        toastr.error((e as Error).message);
    } finally {
        const s = getState();
        if (s) {
            s.isGenerating = false;
            s.abortController = null;
        }
        updateAllComponents();
    }
}

export async function runSelectedStages(): Promise<void> {
    const state = getState();
    if (!state || state.isGenerating || state.isRefining) return;

    if (!isApiReady()) {
        toastr.error('API is not connected');
        return;
    }

    if (!state.pipeline.character) {
        toastr.error('No character selected');
        return;
    }

    const hasSelectedFields = Object.values(state.pipeline.selectedFields).some(v =>
        v === true || (Array.isArray(v) && v.length > 0),
    );

    if (!hasSelectedFields) {
        toastr.error('No fields selected');
        return;
    }

    if (state.pipeline.selectedStages.length === 0) {
        toastr.error('No stages selected');
        return;
    }

    for (const stage of state.pipeline.selectedStages) {
        const s = getState();
        if (!s) break;

        const status = s.pipeline.stageStatus[stage];
        if (status === 'complete' || status === 'skipped') {
            continue;
        }

        s.activeStageView = stage;
        updateStageSection();
        updatePipelineNav();
        updateResultsPanel();

        await runSingleStage(stage);

        // Re-check state after async
        const currentState = getState();
        if (!currentState) break;

        const newStatus = currentState.pipeline.stageStatus[stage];
        if (newStatus !== 'complete') {
            break;
        }
    }
}

export async function runAllStages(): Promise<void> {
    const state = getState();
    if (!state) return;

    state.pipeline = setSelectedStages(state.pipeline, [...STAGES]);
    updatePipelineNav();
    updateResultsPanel();

    await runSelectedStages();
}

export async function runRefinement(): Promise<void> {
    const state = getState();
    const el = getElement();
    if (!state || !el || state.isGenerating || state.isRefining) return;

    if (!isApiReady()) {
        toastr.error('API is not connected');
        return;
    }

    const canRefineResult = canRefine(state.pipeline);
    if (!canRefineResult.canRun) {
        toastr.warning(canRefineResult.reason || 'Cannot refine');
        return;
    }

    const validation = validateRefinement(state.pipeline);
    if (!validation.valid) {
        toastr.error(validation.errors.join('\n'));
        return;
    }

    if (validation.warnings.length > 0) {
        toastr.warning(validation.warnings.join('\n'));
    }

    // Capture state BEFORE startRefinement clears analyze
    const stateForGeneration = {
        ...state.pipeline,
        results: { ...state.pipeline.results },
    };

    const preRefinementState = {
        iterationCount: state.pipeline.iterationCount,
        iterationHistory: [...state.pipeline.iterationHistory],
        analyzeResult: state.pipeline.results.analyze,
    };

    state.pipeline = startRefinement(state.pipeline);
    state.isRefining = true;
    state.abortController = new AbortController();

    const resultsContainer = el.querySelector(`#${MODULE_NAME}_results_container`);
    if (resultsContainer) {
        resultsContainer.innerHTML = renderRefinementLoading(state.pipeline.iterationCount);
    }

    updateIterationIndicator();
    updateIterationHistory();

    try {
        const result = await runRefinementGeneration(
            stateForGeneration,
            state.abortController.signal,
        );

        // Re-acquire state after async
        const s = getState();
        if (!s) return;

        if (result.success) {
            s.pipeline = completeRefinement(s.pipeline, {
                response: result.response,
                isStructured: false,
                promptUsed: '[Refinement prompt]',
                schemaUsed: null,
            });

            toastr.success(`Refinement #${s.pipeline.iterationCount} complete`);

            if (s.pipeline.character) {
                await saveIterationHistory(s.pipeline.character, s.pipeline.iterationHistory);
            }

            s.activeStageView = 'rewrite';
        } else {
            // Restore previous state on failure
            s.pipeline = {
                ...s.pipeline,
                iterationCount: preRefinementState.iterationCount,
                iterationHistory: preRefinementState.iterationHistory,
                results: {
                    ...s.pipeline.results,
                    analyze: preRefinementState.analyzeResult,
                },
                stageStatus: {
                    ...s.pipeline.stageStatus,
                    analyze: 'complete',
                },
                isRefining: preRefinementState.iterationCount > 0,
            };

            if (result.error !== 'Generation cancelled') {
                toastr.error(result.error);
            }
        }
    } catch (e) {
        // Re-acquire state after async
        const s = getState();
        if (s) {
            // Restore previous state on exception
            s.pipeline = {
                ...s.pipeline,
                iterationCount: preRefinementState.iterationCount,
                iterationHistory: preRefinementState.iterationHistory,
                results: {
                    ...s.pipeline.results,
                    analyze: preRefinementState.analyzeResult,
                },
                stageStatus: {
                    ...s.pipeline.stageStatus,
                    analyze: 'complete',
                },
                isRefining: preRefinementState.iterationCount > 0,
            };
        }

        toastr.error((e as Error).message);
    } finally {
        const s = getState();
        if (s) {
            s.isRefining = false;
            s.abortController = null;
        }
        updateAllComponents();
    }
}
