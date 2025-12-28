// src/ui/popup/handlers/stage-config.ts
// Stage configuration handlers

import { MODULE_NAME, STAGE_LABELS } from '../../../constants';
import { updateStageConfig as pipelineUpdateStageConfig, buildStagePrompt } from '../../../pipeline';
import { getFullSystemPrompt } from '../../../settings';
import {
    handleSavePromptPreset,
    handleSaveSchemaPreset,
    handleValidateSchema,
    handleFixSchema,
    handleFormatSchema,
    handleGenerateSchema,
} from '../../components/stage-config';
import { getState, getElement } from '../state';
import { updateStageConfigUI, updateTokenEstimate } from '../updaters';
import { runSingleStage } from '../generation';

export function initStageConfigListeners(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    const container = el.querySelector(`#${MODULE_NAME}_stage_config_container`);
    if (!container) return;

    container.addEventListener('change', (e) => {
        const select = e.target as HTMLSelectElement;
        const s = getState();
        if (!s) return;

        if (select.id === `${MODULE_NAME}_prompt_preset_select`) {
            const value = select.value || null;
            s.pipeline = pipelineUpdateStageConfig(s.pipeline, s.activeStageView, {
                promptPresetId: value,
            });
            updateStageConfigUI();
            updateTokenEstimate();
        }

        if (select.id === `${MODULE_NAME}_schema_preset_select`) {
            const value = select.value || null;
            s.pipeline = pipelineUpdateStageConfig(s.pipeline, s.activeStageView, {
                schemaPresetId: value,
            });
            updateStageConfigUI();
        }

        const checkbox = e.target as HTMLInputElement;
        if (checkbox.id === `${MODULE_NAME}_use_structured`) {
            s.pipeline = pipelineUpdateStageConfig(s.pipeline, s.activeStageView, {
                useStructuredOutput: checkbox.checked,
            });
            updateStageConfigUI();
        }
    });

    const { lodash } = SillyTavern.libs;

    const debouncedInputHandler = lodash.debounce((e: Event) => {
        const s = getState();
        if (!s) return;

        const textarea = e.target as HTMLTextAreaElement;

        if (textarea.id === `${MODULE_NAME}_custom_prompt`) {
            s.pipeline = pipelineUpdateStageConfig(s.pipeline, s.activeStageView, {
                customPrompt: textarea.value,
                promptPresetId: null,
            });
            updateTokenEstimate();
            updateStageConfigUI();
        }

        if (textarea.id === `${MODULE_NAME}_custom_schema`) {
            s.pipeline = pipelineUpdateStageConfig(s.pipeline, s.activeStageView, {
                customSchema: textarea.value,
                schemaPresetId: null,
            });
            updateStageConfigUI();
        }
    }, 300);

    state.debouncedFunctions.push(debouncedInputHandler);
    container.addEventListener('input', debouncedInputHandler);

    container.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const s = getState();
        const currentEl = getElement();
        if (!s || !currentEl) return;

        const runBtn = target.closest(`#${MODULE_NAME}_run_stage_btn`);
        if (runBtn) {
            runSingleStage(s.activeStageView);
            return;
        }

        const previewBtn = target.closest(`#${MODULE_NAME}_preview_prompt_btn`);
        if (previewBtn) {
            await showPromptPreview();
            return;
        }

        const savePromptBtn = target.closest(`#${MODULE_NAME}_save_prompt_preset_btn`);
        if (savePromptBtn) {
            const promptTextarea = currentEl.querySelector(`#${MODULE_NAME}_custom_prompt`) as HTMLTextAreaElement;
            if (promptTextarea) {
                const result = await handleSavePromptPreset(s.activeStageView, promptTextarea.value);
                if (result.success && result.presetId) {
                    s.pipeline = pipelineUpdateStageConfig(s.pipeline, s.activeStageView, {
                        promptPresetId: result.presetId,
                        customPrompt: '',
                    });
                    updateStageConfigUI();
                }
            }
            return;
        }

        const saveSchemaBtn = target.closest(`#${MODULE_NAME}_save_schema_preset_btn`);
        if (saveSchemaBtn) {
            const schemaTextarea = currentEl.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
            if (schemaTextarea) {
                const result = await handleSaveSchemaPreset(s.activeStageView, schemaTextarea.value);
                if (result.success && result.presetId) {
                    s.pipeline = pipelineUpdateStageConfig(s.pipeline, s.activeStageView, {
                        schemaPresetId: result.presetId,
                        customSchema: '',
                    });
                    updateStageConfigUI();
                }
            }
            return;
        }

        const generateBtn = target.closest(`#${MODULE_NAME}_generate_schema_btn`);
        if (generateBtn) {
            const generated = await handleGenerateSchema();
            if (generated) {
                const schemaTextarea = currentEl.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
                if (schemaTextarea) {
                    schemaTextarea.value = generated;
                    s.pipeline = pipelineUpdateStageConfig(s.pipeline, s.activeStageView, {
                        customSchema: generated,
                        schemaPresetId: null,
                    });
                    updateStageConfigUI();
                }
            }
            return;
        }

        const validateBtn = target.closest(`#${MODULE_NAME}_validate_schema_btn`);
        if (validateBtn) {
            const schemaTextarea = currentEl.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
            if (schemaTextarea) {
                await handleValidateSchema(schemaTextarea.value);
            }
            return;
        }

        const fixBtn = target.closest(`#${MODULE_NAME}_fix_schema_btn`);
        if (fixBtn) {
            const schemaTextarea = currentEl.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
            if (schemaTextarea) {
                const fixed = handleFixSchema(schemaTextarea.value);
                if (fixed) {
                    schemaTextarea.value = fixed;
                    s.pipeline = pipelineUpdateStageConfig(s.pipeline, s.activeStageView, {
                        customSchema: fixed,
                        schemaPresetId: null,
                    });
                    updateStageConfigUI();
                }
            }
            return;
        }

        const formatBtn = target.closest(`#${MODULE_NAME}_format_schema_btn`);
        if (formatBtn) {
            const schemaTextarea = currentEl.querySelector(`#${MODULE_NAME}_custom_schema`) as HTMLTextAreaElement;
            if (schemaTextarea) {
                const formatted = handleFormatSchema(schemaTextarea.value);
                if (formatted) {
                    schemaTextarea.value = formatted;
                    s.pipeline = pipelineUpdateStageConfig(s.pipeline, s.activeStageView, {
                        customSchema: formatted,
                        schemaPresetId: null,
                    });
                    updateStageConfigUI();
                }
            }
            return;
        }
    });
}

async function showPromptPreview(): Promise<void> {
    const state = getState();
    if (!state?.pipeline.character) {
        toastr.warning('Select a character first');
        return;
    }

    const { Popup, POPUP_TYPE, getTokenCountAsync } = SillyTavern.getContext();
    const { DOMPurify } = SillyTavern.libs;

    const stage = state.activeStageView;
    const fullPrompt = buildStagePrompt(state.pipeline, stage);
    const systemPrompt = getFullSystemPrompt(stage);

    if (!fullPrompt) {
        toastr.warning('No prompt configured');
        return;
    }

    const promptTokens = await getTokenCountAsync(fullPrompt);
    const systemTokens = await getTokenCountAsync(systemPrompt);
    const totalTokens = promptTokens + systemTokens;

    const content = `
    <div class="${MODULE_NAME}_prompt_preview">
      <h3>Prompt Preview - ${STAGE_LABELS[stage]}</h3>

      <div class="${MODULE_NAME}_preview_section">
        <div class="${MODULE_NAME}_preview_header">
          <h4>System Prompt</h4>
          <span class="${MODULE_NAME}_preview_tokens">${systemTokens.toLocaleString()} tokens</span>
        </div>
        <pre class="${MODULE_NAME}_preview_content">${DOMPurify.sanitize(systemPrompt, { ALLOWED_TAGS: [] })}</pre>
      </div>

      <div class="${MODULE_NAME}_preview_section">
        <div class="${MODULE_NAME}_preview_header">
          <h4>Stage Prompt</h4>
          <span class="${MODULE_NAME}_preview_tokens">${promptTokens.toLocaleString()} tokens</span>
        </div>
        <pre class="${MODULE_NAME}_preview_content">${DOMPurify.sanitize(fullPrompt, { ALLOWED_TAGS: [] })}</pre>
      </div>

      <div class="${MODULE_NAME}_preview_total">
        <strong>Total: ${totalTokens.toLocaleString()} tokens</strong>
      </div>
    </div>
  `;

    await new Popup(DOMPurify.sanitize(content), POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: 'Close',
        cancelButton: false,
    }).show();
}
