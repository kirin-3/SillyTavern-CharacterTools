// src/ui/popup/components/stage-config.ts
//
// Stage configuration component - prompt/schema selection and editing
// PURE RENDER/UPDATE FUNCTIONS ONLY - no state mutation, no action triggers

import { MODULE_NAME, STAGE_LABELS } from '../../../constants';
import { getPromptPresets, getSchemaPresets, getPromptPreset, getSchemaPreset } from '../../../core/settings';
import { resolveSchemaContent } from '../../../core/presets';
import { countTokens } from '../../../core/tokens';
import type { StageName, StageConfig, PromptPreset, SchemaPreset, SchemaValidationResult } from '../../../types';

// ============================================================================
// RENDER
// ============================================================================

export function renderStageConfig(
    stage: StageName,
    config: StageConfig,
    tokenEstimate: { tokens: number; percentage: number } | null,
    hasCharacter: boolean,
    schemaValidation?: SchemaValidationResult,
): string {
    const promptPresets = getPromptPresets(stage);
    const schemaPresets = getSchemaPresets(stage);

    // Get current prompt content - what's actually in the textarea
    let promptContent = config.customPrompt;
    if (config.promptPresetId && !config.customPrompt) {
        const preset = getPromptPreset(config.promptPresetId);
        if (preset) promptContent = preset.prompt;
    }

    // Get current schema content
    const schemaContent = resolveSchemaContent(config);

    // Schema status display
    let schemaStatus = '';
    if (config.useStructuredOutput && schemaContent.trim() && schemaValidation) {
        if (!schemaValidation.valid) {
            schemaStatus = `<div class="${MODULE_NAME}_schema_status error"><i class="fa-solid fa-circle-xmark"></i> ${escapeHtml(schemaValidation.error || 'Invalid schema')}</div>`;
        } else if (schemaValidation.warnings?.length) {
            schemaStatus = `<div class="${MODULE_NAME}_schema_status warning"><i class="fa-solid fa-triangle-exclamation"></i> ${schemaValidation.warnings.length} warning(s)</div>`;
        } else {
            schemaStatus = `<div class="${MODULE_NAME}_schema_status success"><i class="fa-solid fa-circle-check"></i> Valid schema</div>`;
        }
    }

    // Token estimate display
    let tokenDisplay = '<i class="fa-solid fa-microchip"></i> Select a character';
    let tokenClass = '';
    if (tokenEstimate) {
        tokenDisplay = `<i class="fa-solid fa-microchip"></i> ~${tokenEstimate.tokens.toLocaleString()} tokens (${tokenEstimate.percentage}%)`;
        if (tokenEstimate.percentage > 80) tokenClass = 'danger';
        else if (tokenEstimate.percentage > 50) tokenClass = 'warning';
    }

    // CHANGED: Save button is enabled if there's content to save
    // For initial render, we can't know if user has edited - that's handled in updateSavePresetButtons
    const hasPromptContent = promptContent.trim().length > 0;
    const hasSchemaContent = schemaContent.trim().length > 0;

    const showFixButton = config.useStructuredOutput && schemaContent.trim() &&
        schemaValidation && ((schemaValidation.warnings?.length ?? 0) > 0 || !schemaValidation.valid);

    return `
    <div class="${MODULE_NAME}_stage_config">
      <!-- Prompt Section -->
      <div class="${MODULE_NAME}_config_group">
        <div class="${MODULE_NAME}_config_header">
          <span class="${MODULE_NAME}_config_label">Prompt</span>
          <div class="${MODULE_NAME}_config_header_actions">
            <button
              id="${MODULE_NAME}_save_prompt_preset_btn"
              class="${MODULE_NAME}_icon_btn"
              title="Save as Preset"
              ${!hasPromptContent ? 'disabled' : ''}
            >
              <i class="fa-solid fa-floppy-disk"></i>
            </button>
            <select id="${MODULE_NAME}_prompt_preset_select" class="${MODULE_NAME}_preset_select text_pole">
              <option value="">Custom</option>
              ${renderPresetOptions(promptPresets, config.promptPresetId)}
            </select>
          </div>
        </div>
        <textarea
          id="${MODULE_NAME}_custom_prompt"
          class="${MODULE_NAME}_prompt_textarea text_pole"
          placeholder="Enter your prompt for the ${STAGE_LABELS[stage]} stage..."
        >${escapeHtml(promptContent)}</textarea>
        <div class="${MODULE_NAME}_config_footer">
          <span class="${MODULE_NAME}_prompt_tokens" id="${MODULE_NAME}_prompt_token_count">-- tokens</span>
        </div>
      </div>

      <!-- Structured Output Toggle -->
      <div class="${MODULE_NAME}_config_group">
        <label class="checkbox_label">
          <input
            type="checkbox"
            id="${MODULE_NAME}_use_structured"
            ${config.useStructuredOutput ? 'checked' : ''}
          >
          <span>Use Structured Output (JSON Schema)</span>
        </label>
      </div>

      <!-- Schema Section -->
      <div class="${MODULE_NAME}_schema_section ${config.useStructuredOutput ? '' : 'hidden'}">
        <div class="${MODULE_NAME}_config_header">
          <span class="${MODULE_NAME}_config_label">JSON Schema</span>
          <div class="${MODULE_NAME}_config_header_actions">
            <button
              id="${MODULE_NAME}_save_schema_preset_btn"
              class="${MODULE_NAME}_icon_btn"
              title="Save as Preset"
              ${!hasSchemaContent ? 'disabled' : ''}
            >
              <i class="fa-solid fa-floppy-disk"></i>
            </button>
            <select id="${MODULE_NAME}_schema_preset_select" class="${MODULE_NAME}_preset_select text_pole">
              <option value="">Custom</option>
              ${renderPresetOptions(schemaPresets, config.schemaPresetId)}
            </select>
          </div>
        </div>
        <textarea
          id="${MODULE_NAME}_custom_schema"
          class="${MODULE_NAME}_schema_textarea text_pole"
          placeholder='{"name": "MySchema", "value": {"type": "object", ...}}'
        >${escapeHtml(schemaContent)}</textarea>
        ${schemaStatus}

        <!-- Schema Actions -->
        <div class="${MODULE_NAME}_schema_actions">
          <button
            id="${MODULE_NAME}_generate_schema_btn"
            class="menu_button menu_button_icon"
            title="Generate schema from description"
          >
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span>Generate</span>
          </button>
          <button
            id="${MODULE_NAME}_validate_schema_btn"
            class="menu_button menu_button_icon"
            title="Validate schema"
            ${!schemaContent.trim() ? 'disabled' : ''}
          >
            <i class="fa-solid fa-check-double"></i>
            <span>Validate</span>
          </button>
          <button
            id="${MODULE_NAME}_fix_schema_btn"
            class="menu_button menu_button_icon"
            title="Auto-fix schema"
            ${!showFixButton ? 'disabled' : ''}
          >
            <i class="fa-solid fa-wrench"></i>
            <span>Auto-Fix</span>
          </button>
          <button
            id="${MODULE_NAME}_format_schema_btn"
            class="menu_button menu_button_icon"
            title="Format/prettify JSON"
            ${!schemaContent.trim() ? 'disabled' : ''}
          >
            <i class="fa-solid fa-align-left"></i>
            <span>Format</span>
          </button>
        </div>
      </div>

      <!-- Actions -->
      <div class="${MODULE_NAME}_config_actions">
        <div id="${MODULE_NAME}_token_estimate" class="${MODULE_NAME}_token_estimate ${tokenClass}">
          ${tokenDisplay}
        </div>
        <button
          id="${MODULE_NAME}_preview_prompt_btn"
          class="menu_button"
          title="Preview the complete prompt that will be sent"
          ${!hasCharacter ? 'disabled' : ''}
        >
          <i class="fa-solid fa-eye"></i>
          <span>Preview</span>
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// UPDATE STATE
// ============================================================================

export function updateStageConfigState(
    container: HTMLElement,
    stage: StageName,
    config: StageConfig,
    isGenerating: boolean,
    hasCharacter: boolean,
    schemaValidation?: SchemaValidationResult,
    resolvedSchemaContent?: string,
): void {
    const promptPresets = getPromptPresets(stage);
    const schemaPresets = getSchemaPresets(stage);

    // Update prompt preset select
    const promptSelect = container.querySelector(`#${MODULE_NAME}_prompt_preset_select`) as HTMLSelectElement;
    if (promptSelect) {
        promptSelect.innerHTML = `<option value="">Custom</option>${renderPresetOptions(promptPresets, config.promptPresetId)}`;
        promptSelect.value = config.promptPresetId || '';
        promptSelect.disabled = isGenerating;
    }

    // Update prompt textarea
    const promptTextarea = container.querySelector(`#${MODULE_NAME}_custom_prompt`) as HTMLTextAreaElement;
    if (promptTextarea) {
        // Determine what content should be shown
        let promptContent = config.customPrompt;
        if (config.promptPresetId && !config.customPrompt) {
            const preset = getPromptPreset(config.promptPresetId);
            if (preset) promptContent = preset.prompt;
        }

        // Only set value if textarea doesn't have focus (user isn't actively typing)
        if (document.activeElement !== promptTextarea) {
            if (promptTextarea.value !== promptContent) {
                promptTextarea.value = promptContent;
            }
        }
        promptTextarea.disabled = isGenerating;

        // Update token count for prompt (debounced)
        const tokenCountEl = container.querySelector(`#${MODULE_NAME}_prompt_token_count`);
        if (tokenCountEl) {
            // Use the actual textarea value for token count (what user sees)
            countTokens(promptTextarea.value, (tokens) => {
                if (tokens !== null) {
                    tokenCountEl.textContent = `${tokens.toLocaleString()} tokens`;
                } else {
                    tokenCountEl.textContent = '-- tokens';
                }
            });
        }
    }

    // Update structured output toggle
    const structuredToggle = container.querySelector(`#${MODULE_NAME}_use_structured`) as HTMLInputElement;
    if (structuredToggle) {
        structuredToggle.checked = config.useStructuredOutput;
        structuredToggle.disabled = isGenerating;
    }

    // Update schema section visibility
    const schemaSection = container.querySelector(`.${MODULE_NAME}_schema_section`);
    if (schemaSection) {
        schemaSection.classList.toggle('hidden', !config.useStructuredOutput);
    }

    // Update schema preset select
    const schemaSelect = container.querySelector(`#${MODULE_NAME}_schema_preset_select`) as HTMLSelectElement;
    if (schemaSelect) {
        schemaSelect.innerHTML = `<option value="">Custom</option>${renderPresetOptions(schemaPresets, config.schemaPresetId)}`;
        schemaSelect.value = config.schemaPresetId || '';
        schemaSelect.disabled = isGenerating;
    }

    // Use pre-resolved schema content if provided, otherwise resolve here
    const schemaContent = resolvedSchemaContent ?? resolveSchemaContent(config);

    // Update schema textarea
    const schemaTextarea = container.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
    if (schemaTextarea) {
        if (document.activeElement !== schemaTextarea) {
            let schemaDisplayContent = config.customSchema;
            if (config.schemaPresetId && !config.customSchema) {
                schemaDisplayContent = resolvedSchemaContent ?? resolveSchemaContent(config);
            }
            if (schemaTextarea.value !== schemaDisplayContent) {
                schemaTextarea.value = schemaDisplayContent;
            }
        }
        schemaTextarea.disabled = isGenerating;
    }

    // Update schema validation status
    updateSchemaValidationDisplay(container, schemaContent, config.useStructuredOutput, schemaValidation);

    // Update schema action buttons
    updateSchemaActionButtons(container, schemaContent, schemaValidation);

    // Update preview button
    const previewBtn = container.querySelector(`#${MODULE_NAME}_preview_prompt_btn`) as HTMLButtonElement;
    if (previewBtn) {
        previewBtn.disabled = isGenerating || !hasCharacter;
    }

    // CHANGED: Pass actual textarea values, not config values
    const actualPromptValue = promptTextarea?.value || '';
    const actualSchemaValue = schemaTextarea?.value || '';
    updateSavePresetButtons(container, config, actualPromptValue, actualSchemaValue, schemaValidation);
}


// ============================================================================
// PRIVATE HELPERS
// ============================================================================

function renderPresetOptions(presets: (PromptPreset | SchemaPreset)[], selectedId: string | null): string {
    return presets.map(p => {
        const selected = p.id === selectedId ? 'selected' : '';
        const icon = p.isBuiltin ? '📦' : '📝';
        return `<option value="${p.id}" ${selected}>${icon} ${escapeHtml(p.name)}</option>`;
    }).join('');
}

function updateSchemaValidationDisplay(
    container: HTMLElement,
    schemaContent: string,
    useStructuredOutput: boolean,
    schemaValidation?: SchemaValidationResult,
): void {
    const existingStatus = container.querySelector(`.${MODULE_NAME}_schema_status`);
    if (existingStatus) {
        existingStatus.remove();
    }

    if (!useStructuredOutput || !schemaContent.trim() || !schemaValidation) {
        return;
    }

    let statusHtml = '';

    if (!schemaValidation.valid) {
        statusHtml = `<div class="${MODULE_NAME}_schema_status error"><i class="fa-solid fa-circle-xmark"></i> ${escapeHtml(schemaValidation.error || 'Invalid schema')}</div>`;
    } else if (schemaValidation.warnings?.length) {
        statusHtml = `<div class="${MODULE_NAME}_schema_status warning"><i class="fa-solid fa-triangle-exclamation"></i> ${schemaValidation.warnings.length} warning(s)</div>`;
    } else {
        statusHtml = `<div class="${MODULE_NAME}_schema_status success"><i class="fa-solid fa-circle-check"></i> Valid schema</div>`;
    }

    const schemaTextarea = container.querySelector(`#${MODULE_NAME}_custom_schema`);
    if (schemaTextarea) {
        schemaTextarea.insertAdjacentHTML('afterend', statusHtml);
    }
}

function updateSchemaActionButtons(
    container: HTMLElement,
    schemaContent: string,
    schemaValidation?: SchemaValidationResult,
): void {
    const validateBtn = container.querySelector(`#${MODULE_NAME}_validate_schema_btn`) as HTMLButtonElement;
    const fixBtn = container.querySelector(`#${MODULE_NAME}_fix_schema_btn`) as HTMLButtonElement;
    const formatBtn = container.querySelector(`#${MODULE_NAME}_format_schema_btn`) as HTMLButtonElement;

    const hasContent = schemaContent.trim().length > 0;

    if (validateBtn) {
        validateBtn.disabled = !hasContent;
    }

    if (formatBtn) {
        formatBtn.disabled = !hasContent;
    }

    if (fixBtn) {
        if (hasContent && schemaValidation) {
            const needsFix = (schemaValidation.warnings?.length ?? 0) > 0 || !schemaValidation.valid;
            fixBtn.disabled = !needsFix;
        } else {
            fixBtn.disabled = true;
        }
    }
}

function updateSavePresetButtons(
    container: HTMLElement,
    config: StageConfig,
    currentPromptTextareaValue: string,  // CHANGED: renamed for clarity
    currentSchemaTextareaValue: string,  // CHANGED: renamed for clarity
    schemaValidation?: SchemaValidationResult,
): void {
    const savePromptBtn = container.querySelector(`#${MODULE_NAME}_save_prompt_preset_btn`) as HTMLButtonElement;
    const saveSchemaBtn = container.querySelector(`#${MODULE_NAME}_save_schema_preset_btn`) as HTMLButtonElement;

    if (savePromptBtn) {
        const hasContent = currentPromptTextareaValue.trim().length > 0;

        // CHANGED: Enable save if there's content AND either:
        // 1. No preset selected (saving new custom content)
        // 2. Content differs from the selected preset
        let canSave = hasContent;

        if (hasContent && config.promptPresetId) {
            const preset = getPromptPreset(config.promptPresetId);
            // Only disable if content exactly matches the preset
            if (preset && currentPromptTextareaValue === preset.prompt) {
                canSave = false;
            }
        }

        savePromptBtn.disabled = !canSave;
    }

    if (saveSchemaBtn) {
        const hasContent = currentSchemaTextareaValue.trim().length > 0;
        const isValid = hasContent && schemaValidation ? schemaValidation.valid : false;

        // CHANGED: Enable save if there's valid content AND either:
        // 1. No preset selected (saving new custom content)
        // 2. Content differs from the selected preset
        let canSave = hasContent && isValid;

        if (canSave && config.schemaPresetId) {
            const preset = getSchemaPreset(config.schemaPresetId);
            if (preset) {
                const presetJson = JSON.stringify(preset.schema, null, 2);
                // Only disable if content exactly matches the preset
                if (currentSchemaTextareaValue === presetJson) {
                    canSave = false;
                }
            }
        }

        saveSchemaBtn.disabled = !canSave;
    }
}


function escapeHtml(text: string): string {
    const { DOMPurify } = SillyTavern.libs;
    return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
}
