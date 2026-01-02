// src/ui/settings-modal.ts
//
// Settings modal popup - now with connection profile support

import {
    MODULE_NAME,
    BASE_SYSTEM_PROMPT,
    BASE_REFINEMENT_PROMPT,
    VERSION,
    DEFAULT_MAX_TOKENS,
} from '../constants';
import {
    getSettings,
    updateGenerationSettings,
    updateUserSystemPrompt,
    updateBaseSystemPrompt,
    updateStageSystemPrompt,
    updateUserRefinementPrompt,
    updateBaseRefinementPrompt,
    resetUserSystemPrompt,
    resetBaseSystemPrompt,
    resetUserRefinementPrompt,
    resetBaseRefinementPrompt,
    setDebugMode,
    getPromptPresets,
    getSchemaPresets,
    deletePromptPreset,
    deleteSchemaPreset,
    exportCustomPresets,
    importPresets,
} from '../core/settings';
import {
    getAvailableProfiles,
    getApiStatus,
} from '../core/generator';
import {
    debugLog,
    getDebugLogs,
    clearDebugLogs,
    formatLogEntry,
    formatLogData,
    exportDebugInfo,
    generateDebugReport,
} from '../debug';
import type { ProfileInfo, ApiStatusInfo } from '../types';

// ============================================================================
// CLIPBOARD HELPERS
// ============================================================================

/**
 * Copy text to clipboard with fallback for non-secure contexts.
 */
async function copyToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Fall through to fallback
        }
    }

    // Fallback for HTTP/non-secure contexts
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
    } catch {
        return false;
    }
}

/**
 * Read text from clipboard. Only works in secure contexts.
 */
async function readFromClipboard(): Promise<string | null> {
    if (!navigator.clipboard?.readText) {
        return null;
    }
    try {
        return await navigator.clipboard.readText();
    } catch {
        return null;
    }
}

// ============================================================================
// MAIN ENTRY
// ============================================================================

/**
 * Open the settings modal
 */
export async function openSettingsModal(onClose?: () => void): Promise<void> {
    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const { DOMPurify } = SillyTavern.libs;

    const content = buildSettingsContent();

    const popup = new Popup(DOMPurify.sanitize(content), POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: 'Save & Close',
        cancelButton: false,
    });

    popup.show().then(() => {
        onClose?.();
        debugLog('info', 'Settings modal closed', null);
    });

    // Wait for DOM
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    initSettingsListeners();

    debugLog('info', 'Settings modal opened', null);
}

// ============================================================================
// BUILD CONTENT
// ============================================================================

function buildSettingsContent(): string {
    const settings = getSettings();
    const genSettings = settings.generationSettings;
    const profiles = getAvailableProfiles();
    const apiStatus = getApiStatus();
    const { moment } = SillyTavern.libs;

    return `
    <div class="${MODULE_NAME}_settings_modal" id="${MODULE_NAME}_settings_modal">
      <div class="${MODULE_NAME}_settings_header">
        <i class="fa-solid fa-gear"></i>
        <span>Character Tools Settings</span>
      </div>

      <div class="${MODULE_NAME}_settings_content">
        <!-- LEFT COLUMN -->
        <div class="${MODULE_NAME}_settings_column">

          <!-- Generation Settings -->
          <div class="${MODULE_NAME}_settings_section">
            <div class="${MODULE_NAME}_settings_section_header">
              <i class="fa-solid fa-microchip"></i>
              <span>Generation</span>
            </div>

            <!-- API Status Banner -->
            ${renderApiStatusBanner(apiStatus)}

            <!-- Profile Selection -->
            <div class="${MODULE_NAME}_profile_selector">
              ${renderProfileOption('current', 'Use Current Settings',
        'Uses whatever API is configured in SillyTavern right now',
        genSettings.mode === 'current', true)}

              ${profiles.length > 0 ? `
                <div class="${MODULE_NAME}_profile_divider">
                  <span>Connection Profiles</span>
                </div>
                ${profiles.map(p => renderProfileOptionFromInfo(p, genSettings.mode === 'profile' && genSettings.profileId === p.id)).join('')}
              ` : `
                <div class="${MODULE_NAME}_profile_empty">
                  <i class="fa-solid fa-info-circle"></i>
                  <span>No connection profiles found. Create one in SillyTavern's Connection Manager to use a specific API configuration.</span>
                </div>
              `}
            </div>

            <!-- Max Tokens Override -->
            <details class="${MODULE_NAME}_settings_advanced">
              <summary>
                <i class="fa-solid fa-caret-right"></i>
                Response Length Override
              </summary>
              <div class="${MODULE_NAME}_settings_advanced_content">
                <div class="${MODULE_NAME}_settings_row">
                  <label class="checkbox_label">
                    <input
                      type="checkbox"
                      id="${MODULE_NAME}_use_max_tokens_override"
                      ${genSettings.maxTokensOverride !== null ? 'checked' : ''}
                    >
                    <span>Override max response tokens</span>
                  </label>
                </div>
                <div class="${MODULE_NAME}_settings_field">
                  <input
                    type="number"
                    id="${MODULE_NAME}_max_tokens_override"
                    class="text_pole"
                    value="${genSettings.maxTokensOverride ?? DEFAULT_MAX_TOKENS}"
                    min="100"
                    max="32000"
                    step="100"
                    ${genSettings.maxTokensOverride === null ? 'disabled' : ''}
                  >
                  <span class="${MODULE_NAME}_settings_hint">
                    Leave unchecked to use the profile's preset settings (recommended)
                  </span>
                </div>
              </div>
            </details>
          </div>

          <!-- System Prompt -->
          <div class="${MODULE_NAME}_settings_section">
            <div class="${MODULE_NAME}_settings_section_header">
              <i class="fa-solid fa-message"></i>
              <span>System Prompt</span>
            </div>

            <p class="${MODULE_NAME}_settings_hint">
              The system prompt is sent with every generation. Base prompt provides core instructions,
              your additions are appended after.
            </p>

            <div class="${MODULE_NAME}_settings_subsection">
              <label class="${MODULE_NAME}_settings_label">Your Additions</label>
              <textarea
                id="${MODULE_NAME}_user_system_prompt"
                class="text_pole ${MODULE_NAME}_system_prompt_textarea"
                rows="4"
                placeholder="Add your custom instructions here..."
              >${escapeHtml(settings.userSystemPrompt || '')}</textarea>
              <div class="${MODULE_NAME}_settings_row_spread">
                <span id="${MODULE_NAME}_user_system_prompt_chars">${(settings.userSystemPrompt || '').length} chars</span>
                <button id="${MODULE_NAME}_clear_user_system_prompt" class="menu_button">
                  <i class="fa-solid fa-eraser"></i>
                  <span>Clear</span>
                </button>
              </div>
            </div>

            <details class="${MODULE_NAME}_settings_advanced">
              <summary>
                <i class="fa-solid fa-caret-right"></i>
                Base Prompt (Advanced)
              </summary>
              <div class="${MODULE_NAME}_settings_advanced_content">
                <p class="${MODULE_NAME}_settings_hint ${MODULE_NAME}_settings_warning">
                  ⚠️ Editing the base prompt may affect all stages. Reset to restore defaults.
                </p>
                <textarea
                  id="${MODULE_NAME}_base_system_prompt"
                  class="text_pole ${MODULE_NAME}_system_prompt_textarea"
                  rows="6"
                >${escapeHtml(settings.baseSystemPrompt || '')}</textarea>
                <div class="${MODULE_NAME}_settings_row_spread">
                  <span id="${MODULE_NAME}_base_system_prompt_chars">${(settings.baseSystemPrompt || '').length} chars</span>
                  <button id="${MODULE_NAME}_reset_base_system_prompt" class="menu_button">
                    <i class="fa-solid fa-rotate-left"></i>
                    <span>Reset</span>
                  </button>
                </div>
              </div>
            </details>
          </div>

          <!-- Refinement Prompt -->
          <div class="${MODULE_NAME}_settings_section">
            <div class="${MODULE_NAME}_settings_section_header">
              <i class="fa-solid fa-arrows-rotate"></i>
              <span>Refinement Prompt</span>
            </div>

            <p class="${MODULE_NAME}_settings_hint">
              Instructions for the refinement loop. Base provides core guidance, your additions are appended.
            </p>

            <div class="${MODULE_NAME}_settings_subsection">
              <label class="${MODULE_NAME}_settings_label">Your Additions</label>
              <textarea
                id="${MODULE_NAME}_user_refinement_prompt"
                class="text_pole ${MODULE_NAME}_system_prompt_textarea"
                rows="4"
                placeholder="Add your refinement instructions here..."
              >${escapeHtml(settings.userRefinementPrompt || '')}</textarea>
              <div class="${MODULE_NAME}_settings_row_spread">
                <span id="${MODULE_NAME}_user_refinement_prompt_chars">${(settings.userRefinementPrompt || '').length} chars</span>
                <button id="${MODULE_NAME}_clear_user_refinement_prompt" class="menu_button">
                  <i class="fa-solid fa-eraser"></i>
                  <span>Clear</span>
                </button>
              </div>
            </div>

            <details class="${MODULE_NAME}_settings_advanced">
              <summary>
                <i class="fa-solid fa-caret-right"></i>
                Base Prompt (Advanced)
              </summary>
              <div class="${MODULE_NAME}_settings_advanced_content">
                <textarea
                  id="${MODULE_NAME}_base_refinement_prompt"
                  class="text_pole ${MODULE_NAME}_system_prompt_textarea"
                  rows="6"
                >${escapeHtml(settings.baseRefinementPrompt || '')}</textarea>
                <div class="${MODULE_NAME}_settings_row_spread">
                  <span id="${MODULE_NAME}_base_refinement_prompt_chars">${(settings.baseRefinementPrompt || '').length} chars</span>
                  <button id="${MODULE_NAME}_reset_base_refinement_prompt" class="menu_button">
                    <i class="fa-solid fa-rotate-left"></i>
                    <span>Reset</span>
                  </button>
                </div>
              </div>
            </details>
          </div>

        </div>

        <!-- RIGHT COLUMN -->
        <div class="${MODULE_NAME}_settings_column">

          <!-- Preset Management -->
          <div class="${MODULE_NAME}_settings_section">
            <div class="${MODULE_NAME}_settings_section_header">
              <i class="fa-solid fa-bookmark"></i>
              <span>Presets</span>
            </div>

            <div class="${MODULE_NAME}_presets_grid">
              <div class="${MODULE_NAME}_preset_column">
                <h4>Prompt Presets</h4>
                <div id="${MODULE_NAME}_prompt_presets_list" class="${MODULE_NAME}_preset_list">
                  ${renderPresetList('prompt')}
                </div>
              </div>
              <div class="${MODULE_NAME}_preset_column">
                <h4>Schema Presets</h4>
                <div id="${MODULE_NAME}_schema_presets_list" class="${MODULE_NAME}_preset_list">
                  ${renderPresetList('schema')}
                </div>
              </div>
            </div>

            <div class="${MODULE_NAME}_settings_row_spread">
              <button id="${MODULE_NAME}_export_presets" class="menu_button">
                <i class="fa-solid fa-file-export"></i>
                <span>Export Custom</span>
              </button>
              <button id="${MODULE_NAME}_import_presets" class="menu_button">
                <i class="fa-solid fa-file-import"></i>
                <span>Import</span>
              </button>
            </div>
          </div>

          <!-- Keyboard Shortcuts -->
          <div class="${MODULE_NAME}_settings_section">
            <div class="${MODULE_NAME}_settings_section_header">
              <i class="fa-solid fa-keyboard"></i>
              <span>Keyboard Shortcuts</span>
            </div>

            <div class="${MODULE_NAME}_shortcuts_list">
              <div class="${MODULE_NAME}_shortcut_item">
                <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
                <span>Run current stage</span>
              </div>
              <div class="${MODULE_NAME}_shortcut_item">
                <kbd>Escape</kbd>
                <span>Cancel generation</span>
              </div>
            </div>
          </div>

          <!-- Debug -->
          <div class="${MODULE_NAME}_settings_section">
            <div class="${MODULE_NAME}_settings_section_header">
              <i class="fa-solid fa-bug"></i>
              <span>Debug</span>
            </div>

            <div class="${MODULE_NAME}_settings_row">
              <label class="checkbox_label">
                <input
                  type="checkbox"
                  id="${MODULE_NAME}_debug_mode"
                  ${settings.debugMode ? 'checked' : ''}
                >
                <span>Enable Debug Logging</span>
              </label>
            </div>

            <div class="${MODULE_NAME}_debug_actions">
              <button id="${MODULE_NAME}_view_logs" class="menu_button">
                <i class="fa-solid fa-list"></i>
                <span>View Logs</span>
              </button>
              <button id="${MODULE_NAME}_clear_logs" class="menu_button">
                <i class="fa-solid fa-trash"></i>
                <span>Clear</span>
              </button>
              <button id="${MODULE_NAME}_copy_debug_info" class="menu_button">
                <i class="fa-solid fa-copy"></i>
                <span>Copy Info</span>
              </button>
              <button id="${MODULE_NAME}_copy_debug_report" class="menu_button">
                <i class="fa-solid fa-file-medical"></i>
                <span>Bug Report</span>
              </button>
            </div>

            <div id="${MODULE_NAME}_debug_log_viewer" class="${MODULE_NAME}_debug_log_viewer hidden">
              <div id="${MODULE_NAME}_debug_log_list" class="${MODULE_NAME}_debug_log_list"></div>
              <pre id="${MODULE_NAME}_debug_log_detail" class="${MODULE_NAME}_debug_log_detail">Select a log entry</pre>
            </div>
          </div>

        </div>
      </div>

      <!-- Footer -->
      <div class="${MODULE_NAME}_settings_footer">
        <span class="${MODULE_NAME}_settings_version">v${VERSION} • Last updated: ${moment().format('YYYY-MM-DD HH:mm:ss')}</span>
      </div>
    </div>
  `;
}

// ============================================================================
// RENDER HELPERS
// ============================================================================

function renderApiStatusBanner(status: ApiStatusInfo): string {
    const isReady = status.isReady;
    const statusClass = isReady ? 'ready' : 'error';
    const icon = isReady ? 'fa-circle-check' : 'fa-circle-xmark';

    return `
    <div class="${MODULE_NAME}_api_banner ${statusClass}">
      <div class="${MODULE_NAME}_api_banner_left">
        <i class="fa-solid ${icon}"></i>
        <span class="${MODULE_NAME}_api_banner_name">${escapeHtml(status.displayName)}</span>
        <span class="${MODULE_NAME}_api_type_badge ${status.apiType}">${status.apiType === 'cc' ? 'Chat' : 'Text'}</span>
      </div>
      <div class="${MODULE_NAME}_api_banner_right">
        <span class="${MODULE_NAME}_api_model" title="${escapeHtml(status.model)}">${escapeHtml(status.modelDisplay)}</span>
        <span class="${MODULE_NAME}_api_context">${status.contextSize.toLocaleString()} ctx</span>
      </div>
    </div>
    ${status.error ? `
      <div class="${MODULE_NAME}_api_error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>${escapeHtml(status.error)}</span>
      </div>
    ` : ''}
  `;
}

function renderProfileOption(
    id: string,
    title: string,
    description: string,
    isSelected: boolean,
    isSupported: boolean,
    extraInfo?: string,
): string {
    return `
    <div class="${MODULE_NAME}_profile_option ${isSelected ? 'selected' : ''} ${!isSupported ? 'disabled' : ''}"
         data-mode="${id === 'current' ? 'current' : 'profile'}"
         data-profile-id="${id}"
         ${!isSupported ? 'title="This profile is not properly configured"' : ''}>
      <i class="fa-solid ${isSelected ? 'fa-circle-dot' : 'fa-circle'}"></i>
      <div class="${MODULE_NAME}_profile_option_content">
        <div class="${MODULE_NAME}_profile_option_header">
          <span class="${MODULE_NAME}_profile_option_title">${escapeHtml(title)}</span>
          ${!isSupported ? '<i class="fa-solid fa-triangle-exclamation warning"></i>' : ''}
        </div>
        <span class="${MODULE_NAME}_profile_option_desc">${escapeHtml(description)}</span>
        ${extraInfo ? `<span class="${MODULE_NAME}_profile_option_extra">${escapeHtml(extraInfo)}</span>` : ''}
      </div>
    </div>
  `;
}

function renderProfileOptionFromInfo(profile: ProfileInfo, isSelected: boolean): string {
    const description = `${profile.api} • ${truncateModel(profile.model)}`;
    const extraInfo = profile.presetName ? `Preset: ${profile.presetName}` : undefined;

    return `
    <div class="${MODULE_NAME}_profile_option ${isSelected ? 'selected' : ''} ${!profile.isSupported ? 'disabled' : ''}"
         data-mode="profile"
         data-profile-id="${profile.id}"
         ${!profile.isSupported ? `title="${profile.validationError || 'Invalid configuration'}"` : ''}>
      <i class="fa-solid ${isSelected ? 'fa-circle-dot' : 'fa-circle'}"></i>
      <div class="${MODULE_NAME}_profile_option_content">
        <div class="${MODULE_NAME}_profile_option_header">
          <span class="${MODULE_NAME}_profile_option_title">${escapeHtml(profile.name)}</span>
          <span class="${MODULE_NAME}_api_type_badge ${profile.mode}">${profile.mode === 'cc' ? 'Chat' : 'Text'}</span>
          ${!profile.isSupported ? '<i class="fa-solid fa-triangle-exclamation warning"></i>' : ''}
        </div>
        <span class="${MODULE_NAME}_profile_option_desc">${escapeHtml(description)}</span>
        ${extraInfo ? `<span class="${MODULE_NAME}_profile_option_extra">${escapeHtml(extraInfo)}</span>` : ''}
      </div>
    </div>
  `;
}

function truncateModel(model: string): string {
    const stripped = model
        .replace(/^anthropic\//, '')
        .replace(/^openai\//, '')
        .replace(/^google\//, '')
        .replace(/^meta-llama\//, 'llama-')
        .replace(/^mistralai\//, 'mistral-');

    if (stripped.length > 30) {
        return stripped.substring(0, 27) + '...';
    }
    return stripped;
}

function renderPresetList(type: 'prompt' | 'schema'): string {
    const presets = type === 'prompt' ? getPromptPresets() : getSchemaPresets();

    if (presets.length === 0) {
        return `<div class="${MODULE_NAME}_preset_empty">No presets</div>`;
    }

    return presets.map(preset => `
    <div class="${MODULE_NAME}_preset_item ${preset.isBuiltin ? 'builtin' : ''}" data-id="${preset.id}">
      <span class="${MODULE_NAME}_preset_name">
        ${preset.isBuiltin ? '<i class="fa-solid fa-lock"></i>' : ''}
        ${escapeHtml(preset.name)}
      </span>
      ${!preset.isBuiltin ? `
        <button class="${MODULE_NAME}_preset_delete menu_button" data-type="${type}" data-id="${preset.id}" title="Delete">
          <i class="fa-solid fa-trash"></i>
        </button>
      ` : ''}
    </div>
  `).join('');
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function initSettingsListeners(): void {
    const modal = document.getElementById(`${MODULE_NAME}_settings_modal`);
    if (!modal) return;

    // ========== PROFILE SELECTION ==========

    modal.querySelectorAll(`.${MODULE_NAME}_profile_option`).forEach(el => {
        el.addEventListener('click', () => {
            const element = el as HTMLElement;

            // Don't allow selecting disabled profiles
            if (element.classList.contains('disabled')) {
                toastr.warning('This profile is not properly configured. Check Connection Manager.');
                return;
            }

            const mode = element.dataset.mode as 'current' | 'profile';
            const profileId = element.dataset.profileId;

            if (mode === 'current') {
                updateGenerationSettings({ mode: 'current', profileId: null });
            } else if (profileId) {
                updateGenerationSettings({ mode: 'profile', profileId });
            }

            // Update UI
            modal.querySelectorAll(`.${MODULE_NAME}_profile_option`).forEach(opt => {
                opt.classList.remove('selected');
                const icon = opt.querySelector('i.fa-solid');
                if (icon) {
                    icon.classList.remove('fa-circle-dot');
                    icon.classList.add('fa-circle');
                }
            });

            element.classList.add('selected');
            const icon = element.querySelector('i.fa-solid');
            if (icon) {
                icon.classList.remove('fa-circle');
                icon.classList.add('fa-circle-dot');
            }

            // Refresh the status banner
            refreshApiStatusBanner();

            toastr.success(`Generation mode: ${mode === 'current' ? 'Current Settings' : 'Connection Profile'}`);
        });
    });

    // ========== MAX TOKENS OVERRIDE ==========

    const useMaxTokensOverride = modal.querySelector(`#${MODULE_NAME}_use_max_tokens_override`) as HTMLInputElement;
    const maxTokensInput = modal.querySelector(`#${MODULE_NAME}_max_tokens_override`) as HTMLInputElement;

    useMaxTokensOverride?.addEventListener('change', () => {
        const enabled = useMaxTokensOverride.checked;
        maxTokensInput.disabled = !enabled;

        if (enabled) {
            const value = parseInt(maxTokensInput.value, 10);
            updateGenerationSettings({ maxTokensOverride: isNaN(value) ? DEFAULT_MAX_TOKENS : value });
        } else {
            updateGenerationSettings({ maxTokensOverride: null });
        }
    });

    maxTokensInput?.addEventListener('change', () => {
        if (!useMaxTokensOverride.checked) return;

        const value = parseInt(maxTokensInput.value, 10);
        if (!isNaN(value) && value >= 100 && value <= 32000) {
            updateGenerationSettings({ maxTokensOverride: value });
        }
    });

    // ========== USER SYSTEM PROMPT ==========

    const userSystemPromptTextarea = modal.querySelector(`#${MODULE_NAME}_user_system_prompt`) as HTMLTextAreaElement;
    const userSystemPromptChars = modal.querySelector(`#${MODULE_NAME}_user_system_prompt_chars`);
    const clearUserSystemPromptBtn = modal.querySelector(`#${MODULE_NAME}_clear_user_system_prompt`);

    userSystemPromptTextarea?.addEventListener('input', () => {
        updateUserSystemPrompt(userSystemPromptTextarea.value);
        if (userSystemPromptChars) {
            userSystemPromptChars.textContent = `${userSystemPromptTextarea.value.length} chars`;
        }
    });

    clearUserSystemPromptBtn?.addEventListener('click', () => {
        resetUserSystemPrompt();
        if (userSystemPromptTextarea) userSystemPromptTextarea.value = '';
        if (userSystemPromptChars) userSystemPromptChars.textContent = '0 chars';
        toastr.info('User system prompt cleared');
    });

    // ========== BASE SYSTEM PROMPT ==========

    const baseSystemPromptTextarea = modal.querySelector(`#${MODULE_NAME}_base_system_prompt`) as HTMLTextAreaElement;
    const baseSystemPromptChars = modal.querySelector(`#${MODULE_NAME}_base_system_prompt_chars`);
    const resetBaseSystemPromptBtn = modal.querySelector(`#${MODULE_NAME}_reset_base_system_prompt`);

    baseSystemPromptTextarea?.addEventListener('input', () => {
        updateBaseSystemPrompt(baseSystemPromptTextarea.value);
        if (baseSystemPromptChars) {
            baseSystemPromptChars.textContent = `${baseSystemPromptTextarea.value.length} chars`;
        }
    });

    resetBaseSystemPromptBtn?.addEventListener('click', () => {
        resetBaseSystemPrompt();
        if (baseSystemPromptTextarea) baseSystemPromptTextarea.value = BASE_SYSTEM_PROMPT;
        if (baseSystemPromptChars) baseSystemPromptChars.textContent = `${BASE_SYSTEM_PROMPT.length} chars`;
        toastr.info('Base system prompt reset to default');
    });

    // ========== STAGE SYSTEM PROMPTS ==========

    for (const stage of ['score', 'rewrite', 'analyze'] as const) {
        const textarea = modal.querySelector(`#${MODULE_NAME}_stage_system_prompt_${stage}`) as HTMLTextAreaElement;
        textarea?.addEventListener('input', () => {
            updateStageSystemPrompt(stage, textarea.value);
        });
    }

    // ========== USER REFINEMENT PROMPT ==========

    const userRefinementPromptTextarea = modal.querySelector(`#${MODULE_NAME}_user_refinement_prompt`) as HTMLTextAreaElement;
    const userRefinementPromptChars = modal.querySelector(`#${MODULE_NAME}_user_refinement_prompt_chars`);
    const clearUserRefinementPromptBtn = modal.querySelector(`#${MODULE_NAME}_clear_user_refinement_prompt`);

    userRefinementPromptTextarea?.addEventListener('input', () => {
        updateUserRefinementPrompt(userRefinementPromptTextarea.value);
        if (userRefinementPromptChars) {
            userRefinementPromptChars.textContent = `${userRefinementPromptTextarea.value.length} chars`;
        }
    });

    clearUserRefinementPromptBtn?.addEventListener('click', () => {
        resetUserRefinementPrompt();
        if (userRefinementPromptTextarea) userRefinementPromptTextarea.value = '';
        if (userRefinementPromptChars) userRefinementPromptChars.textContent = '0 chars';
        toastr.info('User refinement prompt cleared');
    });

    // ========== BASE REFINEMENT PROMPT ==========

    const baseRefinementPromptTextarea = modal.querySelector(`#${MODULE_NAME}_base_refinement_prompt`) as HTMLTextAreaElement;
    const baseRefinementPromptChars = modal.querySelector(`#${MODULE_NAME}_base_refinement_prompt_chars`);
    const resetBaseRefinementPromptBtn = modal.querySelector(`#${MODULE_NAME}_reset_base_refinement_prompt`);

    baseRefinementPromptTextarea?.addEventListener('input', () => {
        updateBaseRefinementPrompt(baseRefinementPromptTextarea.value);
        if (baseRefinementPromptChars) {
            baseRefinementPromptChars.textContent = `${baseRefinementPromptTextarea.value.length} chars`;
        }
    });

    resetBaseRefinementPromptBtn?.addEventListener('click', () => {
        resetBaseRefinementPrompt();
        if (baseRefinementPromptTextarea) baseRefinementPromptTextarea.value = BASE_REFINEMENT_PROMPT;
        if (baseRefinementPromptChars) baseRefinementPromptChars.textContent = `${BASE_REFINEMENT_PROMPT.length} chars`;
        toastr.info('Base refinement prompt reset to default');
    });

    // ========== PRESET MANAGEMENT ==========

    modal.addEventListener('click', (e) => {
        const deleteBtn = (e.target as HTMLElement).closest(`.${MODULE_NAME}_preset_delete`);
        if (deleteBtn) {
            const type = deleteBtn.getAttribute('data-type') as 'prompt' | 'schema';
            const id = deleteBtn.getAttribute('data-id');
            if (type && id) {
                handleDeletePreset(type, id);
            }
        }
    });

    const exportPresetsBtn = modal.querySelector(`#${MODULE_NAME}_export_presets`);
    const importPresetsBtn = modal.querySelector(`#${MODULE_NAME}_import_presets`);

    exportPresetsBtn?.addEventListener('click', async () => {
        const json = exportCustomPresets();
        const success = await copyToClipboard(json);
        if (success) {
            toastr.success('Custom presets copied to clipboard');
        } else {
            toastr.error('Failed to copy. Try HTTPS or localhost.');
        }
    });

    importPresetsBtn?.addEventListener('click', async () => {
        const json = await readFromClipboard();
        if (json === null) {
        // Clipboard read not available - show input dialog instead
            const { Popup } = SillyTavern.getContext();
            const input = await Popup.show.input(
                'Import Presets',
                'Paste your preset JSON here:',
                '',
            );
            // Popup.show.input returns string | null
            // null = cancelled, empty string = user submitted nothing
            if (!input || !input.trim()) {
                return;
            }
            const result = importPresets(input);
            if (result.errors.length > 0) {
                toastr.error(result.errors.join('\n'));
            } else {
                toastr.success(`Imported ${result.prompts} prompts, ${result.schemas} schemas`);
                refreshPresetLists();
            }
            return;
        }

        const result = importPresets(json);
        if (result.errors.length > 0) {
            toastr.error(result.errors.join('\n'));
        } else {
            toastr.success(`Imported ${result.prompts} prompts, ${result.schemas} schemas`);
            refreshPresetLists();
        }
    });


    // ========== DEBUG ==========

    const debugModeCheckbox = modal.querySelector(`#${MODULE_NAME}_debug_mode`) as HTMLInputElement;
    const viewLogsBtn = modal.querySelector(`#${MODULE_NAME}_view_logs`);
    const clearLogsBtn = modal.querySelector(`#${MODULE_NAME}_clear_logs`);
    const copyDebugBtn = modal.querySelector(`#${MODULE_NAME}_copy_debug_info`);
    const copyDebugReportBtn = modal.querySelector(`#${MODULE_NAME}_copy_debug_report`);
    const logViewer = modal.querySelector(`#${MODULE_NAME}_debug_log_viewer`);

    debugModeCheckbox?.addEventListener('change', () => {
        setDebugMode(debugModeCheckbox.checked);
        toastr.info(`Debug mode ${debugModeCheckbox.checked ? 'enabled' : 'disabled'}`);
    });

    viewLogsBtn?.addEventListener('click', () => {
        logViewer?.classList.toggle('hidden');
        if (!logViewer?.classList.contains('hidden')) {
            refreshDebugLogs();
        }
    });

    clearLogsBtn?.addEventListener('click', () => {
        clearDebugLogs();
        refreshDebugLogs();
        toastr.info('Debug logs cleared');
    });

    copyDebugBtn?.addEventListener('click', async () => {
        const success = await copyToClipboard(exportDebugInfo());
        if (success) {
            toastr.success('Debug info (JSON) copied to clipboard');
        } else {
            toastr.error('Failed to copy. Try HTTPS or localhost.');
        }
    });

    copyDebugReportBtn?.addEventListener('click', async () => {
        const success = await copyToClipboard(generateDebugReport());
        if (success) {
            toastr.success('Bug report copied to clipboard');
        } else {
            toastr.error('Failed to copy. Try HTTPS or localhost.');
        }
    });
}

// ============================================================================
// REFRESH FUNCTIONS
// ============================================================================

function refreshApiStatusBanner(): void {
    const modal = document.getElementById(`${MODULE_NAME}_settings_modal`);
    if (!modal) return;

    const status = getApiStatus();
    const bannerContainer = modal.querySelector(`.${MODULE_NAME}_api_banner`)?.parentElement;

    if (bannerContainer) {
        // Find and remove existing banner and error
        const existingBanner = bannerContainer.querySelector(`.${MODULE_NAME}_api_banner`);
        const existingError = bannerContainer.querySelector(`.${MODULE_NAME}_api_error`);
        existingBanner?.remove();
        existingError?.remove();

        // Insert new banner at the start
        const newBannerHtml = renderApiStatusBanner(status);
        const temp = document.createElement('div');
        temp.innerHTML = newBannerHtml;

        // Insert before profile selector
        const profileSelector = bannerContainer.querySelector(`.${MODULE_NAME}_profile_selector`);
        if (profileSelector) {
            while (temp.firstChild) {
                bannerContainer.insertBefore(temp.firstChild, profileSelector);
            }
        }
    }
}

function handleDeletePreset(type: 'prompt' | 'schema', id: string): void {
    const deletedId = type === 'prompt' ? deletePromptPreset(id) : deleteSchemaPreset(id);

    if (deletedId) {
        toastr.success('Preset deleted');
        refreshPresetLists();
    } else {
        toastr.error('Cannot delete builtin preset');
    }
}

function refreshPresetLists(): void {
    const modal = document.getElementById(`${MODULE_NAME}_settings_modal`);
    if (!modal) return;

    const promptList = modal.querySelector(`#${MODULE_NAME}_prompt_presets_list`);
    const schemaList = modal.querySelector(`#${MODULE_NAME}_schema_presets_list`);

    if (promptList) {
        promptList.innerHTML = renderPresetList('prompt');
    }
    if (schemaList) {
        schemaList.innerHTML = renderPresetList('schema');
    }
}

function refreshDebugLogs(): void {
    const modal = document.getElementById(`${MODULE_NAME}_settings_modal`);
    if (!modal) return;

    const logList = modal.querySelector(`#${MODULE_NAME}_debug_log_list`);
    const logDetail = modal.querySelector(`#${MODULE_NAME}_debug_log_detail`);

    if (!logList || !logDetail) return;

    const logs = getDebugLogs();

    logList.innerHTML = logs.length
        ? logs.map((entry, i) => `
        <div class="${MODULE_NAME}_debug_log_entry" data-index="${i}">
          ${formatLogEntry(entry)}
        </div>
      `).join('')
        : `<div class="${MODULE_NAME}_debug_log_empty">No logs</div>`;

    // Click handler for log entries
    logList.querySelectorAll(`.${MODULE_NAME}_debug_log_entry`).forEach(el => {
        el.addEventListener('click', () => {
            const index = parseInt((el as HTMLElement).dataset.index || '0', 10);
            const entry = logs[index];
            if (entry && logDetail) {
                logDetail.textContent = formatLogData(entry.data);
            }
        });
    });
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(value: unknown): string {
    const { DOMPurify } = SillyTavern.libs;
    const str = typeof value === 'string' ? value : String(value ?? '');
    return DOMPurify.sanitize(str, { ALLOWED_TAGS: [] });
}
