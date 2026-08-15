// src/ui/components/results-panel.ts
//
// Results display and actions component

import { MODULE_NAME, STAGE_LABELS } from '../../../constants';
import { formatResponse, formatRewriteResponse, formatStructuredResponse } from '../../formatter';
import { canExport, canRefine, extractVerdict } from '../../../core/pipeline';
import { buildRewriteReview } from '../../../core/rewrite';
import { canRevertLastCharacterWrite } from '../../../core/character-write';
import type { StageName, StageStatus, StageResult, PipelineState, IterationVerdict } from '../../../types';

// ============================================================================
// RENDER
// ============================================================================

/**
 * Render the results panel
 */
export function renderResultsPanel(
    stage: StageName,
    result: StageResult | null,
    status: StageStatus,
    isGenerating: boolean,
    pipeline?: PipelineState,
): string {
    if (isGenerating && status === 'running') {
        return renderLoading(stage);
    }

    if (!result) {
        return renderPlaceholder(stage, status);
    }

    return renderResult(stage, result, pipeline);
}

function renderLoading(stage: StageName): string {
    return `
    <div class="${MODULE_NAME}_results_loading">
      <i class="fa-solid fa-spinner fa-spin fa-2x"></i>
      <p>Running ${STAGE_LABELS[stage]}...</p>
      <button id="${MODULE_NAME}_cancel_btn" class="menu_button">
        <i class="fa-solid fa-stop"></i>
        <span>Cancel</span>
      </button>
    </div>
  `;
}

/**
 * Render loading state for refinement
 */
export function renderRefinementLoading(iteration: number): string {
    return `
    <div class="${MODULE_NAME}_results_loading">
      <i class="fa-solid fa-spinner fa-spin fa-2x"></i>
      <p>Refining (Iteration #${iteration + 1})...</p>
      <button id="${MODULE_NAME}_cancel_btn" class="menu_button">
        <i class="fa-solid fa-stop"></i>
        <span>Cancel</span>
      </button>
    </div>
  `;
}

function renderPlaceholder(stage: StageName, status: StageStatus): string {
    let message = `Run ${STAGE_LABELS[stage]} to see results`;
    let icon = 'fa-play';

    if (status === 'skipped') {
        message = `${STAGE_LABELS[stage]} was skipped`;
        icon = 'fa-forward';
    }

    return `
    <div class="${MODULE_NAME}_results_placeholder">
      <i class="fa-solid ${icon}"></i>
      <p>${message}</p>
    </div>
  `;
}

function renderResult(stage: StageName, result: StageResult, pipeline?: PipelineState): string {
    const formattedContent = stage === 'rewrite' && result.isStructured && pipeline?.character
        ? formatRewriteResponse(result.response, pipeline.character, pipeline.selectedFields, MODULE_NAME)
        : result.isStructured
            ? formatStructuredResponse(result.response, result.schemaUsed, MODULE_NAME)
            : formatResponse(result.response, MODULE_NAME);

    const timestamp = new Date(result.timestamp).toLocaleTimeString();
    const fallbackBadge = result.structuredFallbackReason
        ? `<span class="${MODULE_NAME}_badge" title="${escapeAttribute(result.structuredFallbackReason)}"><i class="fa-solid fa-triangle-exclamation"></i> Unstructured fallback</span>`
        : '';
    const retryBadge = result.malformedResponseRetried
        ? `<span class="${MODULE_NAME}_badge" title="${escapeAttribute(result.malformedResponseRetryReason ?? 'Malformed structured response')}"><i class="fa-solid fa-rotate"></i> Re-asked once</span>`
        : '';

    // Extract verdict if this is an analyze result
    let verdictBadge = '';
    if (stage === 'analyze') {
        const verdict = extractVerdict(result.response);
        verdictBadge = renderVerdictBadge(verdict);
    }

    return `
    <div class="${MODULE_NAME}_results_content">
      <!-- Toolbar -->
      <div class="${MODULE_NAME}_results_toolbar">
        <div class="${MODULE_NAME}_results_info">
          <span class="${MODULE_NAME}_badge">${STAGE_LABELS[stage]}</span>
          ${verdictBadge}
          ${fallbackBadge}
          ${retryBadge}
          <span class="${MODULE_NAME}_results_time">${timestamp}</span>
          ${result.locked ? `<span class="${MODULE_NAME}_badge ${MODULE_NAME}_badge_locked"><i class="fa-solid fa-lock"></i> Locked</span>` : ''}
        </div>
        <div class="${MODULE_NAME}_results_actions">
          <button id="${MODULE_NAME}_lock_btn" class="${MODULE_NAME}_icon_btn ${result.locked ? 'hidden' : ''}" title="Lock result">
            <i class="fa-solid fa-lock-open"></i>
          </button>
          <button id="${MODULE_NAME}_unlock_btn" class="${MODULE_NAME}_icon_btn ${result.locked ? '' : 'hidden'}" title="Unlock for editing">
            <i class="fa-solid fa-lock"></i>
          </button>
          <button id="${MODULE_NAME}_copy_btn" class="${MODULE_NAME}_icon_btn" title="Copy to clipboard">
            <i class="fa-solid fa-copy"></i>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="${MODULE_NAME}_results_body">
        ${formattedContent}
      </div>

      <!-- Footer Actions -->
      <div class="${MODULE_NAME}_results_footer" id="${MODULE_NAME}_results_footer">
        <!-- Populated by updateResultsPanelState -->
      </div>
    </div>
  `;
}

function renderVerdictBadge(verdict: IterationVerdict): string {
    const icons: Record<IterationVerdict, string> = {
        accept: 'fa-check-circle',
        needs_refinement: 'fa-wrench',
        regression: 'fa-arrow-down',
        indeterminate: 'fa-circle-question',
    };

    const labels: Record<IterationVerdict, string> = {
        accept: 'Accept',
        needs_refinement: 'Needs Work',
        regression: 'Regression',
        indeterminate: 'Needs Your Judgment',
    };

    return `
    <span class="${MODULE_NAME}_badge ${MODULE_NAME}_verdict_badge ${MODULE_NAME}_verdict_${verdict}">
      <i class="fa-solid ${icons[verdict]}"></i>
      ${labels[verdict]}
    </span>
  `;
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update results panel state
 */
export function updateResultsPanelState(
    container: HTMLElement,
    stage: StageName,
    result: StageResult | null,
    status: StageStatus,
    isGenerating: boolean,
    nextStage: StageName | null,
    pipeline: PipelineState,
): void {
    const shouldShowLoading = isGenerating && status === 'running';
    const shouldShowResult = result && !shouldShowLoading;
    const shouldShowPlaceholder = !result && !shouldShowLoading;

    if (shouldShowLoading) {
        container.innerHTML = renderLoading(stage);
        return;
    }

    if (shouldShowPlaceholder) {
        container.innerHTML = renderPlaceholder(stage, status);
        return;
    }

    if (shouldShowResult) {
        // Only re-render result if we don't have content or timestamp changed
        const existingContent = container.querySelector(`.${MODULE_NAME}_results_content`);
        const existingTimestamp = container.querySelector(`.${MODULE_NAME}_results_time`)?.textContent;
        const newTimestamp = new Date(result.timestamp).toLocaleTimeString();

        if (!existingContent || existingTimestamp !== newTimestamp) {
            container.innerHTML = renderResult(stage, result, pipeline);
        }
    }

    // Update footer actions
    const footer = container.querySelector(`#${MODULE_NAME}_results_footer`);

    if (footer && result) {
        footer.innerHTML = renderFooterActions(stage, result, nextStage, pipeline);
    }
}


function renderFooterActions(
    stage: StageName,
    result: StageResult,
    nextStage: StageName | null,
    pipeline: PipelineState,
): string {
    const actions: string[] = [];

    // Regenerate (if not locked)
    if (!result.locked) {
        actions.push(`
      <button id="${MODULE_NAME}_regenerate_btn" class="menu_button">
        <i class="fa-solid fa-rotate"></i>
        <span>Regenerate</span>
      </button>
    `);
    }

    // Stage-specific actions
    if (stage === 'rewrite' && pipeline.isRefining && !pipeline.results.analyze) {
        // After refinement completes, prompt user to analyze the new rewrite
        actions.push(`
      <button id="${MODULE_NAME}_run_analyze_btn" class="menu_button ${MODULE_NAME}_continue_btn">
        <i class="fa-solid fa-magnifying-glass-chart"></i>
        <span>Analyze This Rewrite</span>
      </button>
    `);
    }

    if (stage === 'rewrite' && pipeline.character) {
        const review = buildRewriteReview(result.response, pipeline.character, pipeline.selectedFields);
        const selectable = review.entries.some(entry => entry.writable && !entry.unchanged);
        if (result.isStructured && !review.error && selectable) {
            actions.push(`
      <button id="${MODULE_NAME}_apply_rewrite_btn" class="menu_button">
        <i class="fa-solid fa-file-import"></i>
        <span>Apply Selected Fields</span>
      </button>
    `);
        } else {
            actions.push(`<span class="${MODULE_NAME}_verdict_notice">${renderApplyUnavailableReason(result, review)}</span>`);
        }

        if (canRevertLastCharacterWrite()) {
            actions.push(`
      <button id="${MODULE_NAME}_revert_write_btn" class="menu_button">
        <i class="fa-solid fa-rotate-left"></i>
        <span>Revert Last Apply</span>
      </button>
    `);
        }
    }

    if (stage === 'analyze') {
        const verdict = extractVerdict(result.response);
        const canRefineResult = canRefine(pipeline);

        if (verdict === 'indeterminate') {
            actions.push(`
        <div class="${MODULE_NAME}_verdict_notice">
          The analysis did not contain one clear verdict. Review the comparison and choose whether to refine or accept.
        </div>
      `);
        }

        // Refine button (if we can refine)
        if (canRefineResult.canRun) {
            const isRecommended = verdict === 'needs_refinement';
            actions.push(`
        <button id="${MODULE_NAME}_refine_btn" class="menu_button ${isRecommended ? MODULE_NAME + '_refine_recommended' : ''}">
          <i class="fa-solid fa-arrows-rotate"></i>
          <span>Refine</span>
          ${pipeline.iterationCount > 0 ? `<span class="${MODULE_NAME}_iteration_badge">#${pipeline.iterationCount + 1}</span>` : ''}
        </button>
      `);
        }

        // Accept button (if we have an unlocked rewrite)
        if (pipeline.results.rewrite && !pipeline.results.rewrite.locked) {
            const isRecommended = verdict === 'accept';
            actions.push(`
        <button id="${MODULE_NAME}_accept_btn" class="menu_button ${isRecommended ? MODULE_NAME + '_accept_recommended' : ''}">
          <i class="fa-solid fa-check"></i>
          <span>Accept Rewrite</span>
        </button>
      `);
        }
    }

    // Continue to next stage (not on analyze, not when in refinement mode on rewrite)
    if (nextStage && stage !== 'analyze' && !(stage === 'rewrite' && pipeline.isRefining)) {
        actions.push(`
      <button id="${MODULE_NAME}_continue_btn" class="menu_button ${MODULE_NAME}_continue_btn">
        <i class="fa-solid fa-arrow-right"></i>
        <span>Continue to ${STAGE_LABELS[nextStage]}</span>
      </button>
    `);
    }

    // Export (if we have rewrite results)
    if (canExport(pipeline)) {
        actions.push(`
      <button id="${MODULE_NAME}_export_btn" class="menu_button">
        <i class="fa-solid fa-file-export"></i>
        <span>Export</span>
      </button>
    `);
    }

    return `<div class="${MODULE_NAME}_footer_actions">${actions.join('')}</div>`;
}

/** Pure message builder exported for non-DOM regression tests. */
export function renderApplyUnavailableReason(
    result: StageResult,
    review: ReturnType<typeof buildRewriteReview>,
): string {
    const copyFallback = ' Copy and export remain available.';
    if (!result.isStructured || review.error) {
        const error = review.error ?? result.structuredFallbackReason ?? 'Unknown parse error';
        return `Apply unavailable: rewrite output could not be parsed (${escapeAttribute(error)}).${copyFallback}`;
    }
    if (review.entries.length === 0) {
        return `Apply unavailable: the response contains no selected rewrite entries.${copyFallback}`;
    }
    if (review.entries.every(entry => !entry.writable)) {
        return `Apply unavailable: all proposed entries are lorebook-only and cannot be written.${copyFallback}`;
    }
    if (review.entries.every(entry => entry.unchanged)) {
        return `Apply unavailable: all proposed entries are unchanged.${copyFallback}`;
    }
    return `Apply unavailable: every proposed entry is either unwritable or unchanged.${copyFallback}`;
}

function escapeAttribute(value: string): string {
    return value.replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;',
    })[character]!);
}
