// src/ui/settings-modal.ts
//
// Settings modal popup - with connection profile support

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
import { countTokens, clearTokenCache } from '../core/tokens';
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
// DEBOUNCE HELPER
// ============================================================================

const SETTINGS_DEBOUNCE_MS = 500;

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function debounce<T extends (...args: never[]) => void>(key: string, fn: T, delay: number = SETTINGS_DEBOUNCE_MS): T {
    return ((...args: Parameters<T>) => {
        const existing = debounceTimers.get(key);
        if (existing) {
            clearTimeout(existing);
        }
        debounceTimers.set(key, setTimeout(() => {
            debounceTimers.delete(key);
            fn(...args);
        }, delay));
    }) as T;
}

function clearAllDebounceTimers(): void {
    for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
    }
    debounceTimers.clear();
}

// ============================================================================
// CLIPBOARD HELPERS
// ============================================================================

async function copyToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Fall through to fallback
        }
    }

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
        // Flush any pending debounced saves before closing
        flushPendingSettings();
        clearAllDebounceTimers();
        onClose?.();
        debugLog('info', 'Settings modal closed', null);
    });

    await new Promise<void>(resolve => setTimeout(resolve, 0));

    initSettingsListeners();
    updatePromptTokenCounts();

    debugLog('info', 'Settings modal opened', null);
}

/**
 * Flush all pending debounced settings updates immediately
 */
function flushPendingSettings(): void {
    const modal = document.getElementById(`${MODULE_NAME}_settings_modal`);
    if (!modal) return;

    // Get current values and save them directly
    const userSystemPrompt = modal.querySelector(`#${MODULE_NAME}_user_system_prompt`) as HTMLTextAreaElement;
    const baseSystemPrompt = modal.querySelector(`#${MODULE_NAME}_base_system_prompt`) as HTMLTextAreaElement;
    const userRefinementPrompt = modal.querySelector(`#${MODULE_NAME}_user_refinement_prompt`) as HTMLTextAreaElement;
    const baseRefinementPrompt = modal.querySelector(`#${MODULE_NAME}_base_refinement_prompt`) as HTMLTextAreaElement;

    const settings = getSettings();

    if (userSystemPrompt && userSystemPrompt.value !== settings.userSystemPrompt) {
        updateUserSystemPrompt(userSystemPrompt.value);
    }
    if (baseSystemPrompt && baseSystemPrompt.value !== settings.baseSystemPrompt) {
        updateBaseSystemPrompt(baseSystemPrompt.value);
    }
    if (userRefinementPrompt && userRefinementPrompt.value !== settings.userRefinementPrompt) {
        updateUserRefinementPrompt(userRefinementPrompt.value);
    }
    if (baseRefinementPrompt && baseRefinementPrompt.value !== settings.baseRefinementPrompt) {
        updateBaseRefinementPrompt(baseRefinementPrompt.value);
    }
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

            <!-- Current API Status -->
            ${renderApiStatusBanner(apiStatus)}

            <!-- Mode Toggle -->
            <div class="${MODULE_NAME}_gen_mode_toggle">
              <label class="${MODULE_NAME}_gen_mode_option ${genSettings.mode === 'current' ? 'active' : ''}" data-mode="current">
                <input type="radio" name="${MODULE_NAME}_gen_mode" value="current" ${genSettings.mode === 'current' ? 'checked' : ''}>
                <i class="fa-solid fa-sliders"></i>
                <span>Current ST Settings</span>
              </label>
              <label class="${MODULE_NAME}_gen_mode_option ${genSettings.mode === 'profile' ? 'active' : ''}" data-mode="profile">
                <input type="radio" name="${MODULE_NAME}_gen_mode" value="profile" ${genSettings.mode === 'profile' ? 'checked' : ''}>
                <i class="fa-solid fa-plug"></i>
                <span>Connection Profile</span>
              </label>
            </div>

            <!-- Profile Selection (shown when mode=profile) -->
            <div class="${MODULE_NAME}_profile_section ${genSettings.mode === 'current' ? 'hidden' : ''}" id="${MODULE_NAME}_profile_section">
              ${profiles.length > 0 ? `
                <div class="${MODULE_NAME}_profile_select_wrapper">
                  <label class="${MODULE_NAME}_settings_label">Select Profile</label>
                  <select id="${MODULE_NAME}_profile_select" class="text_pole">
                    <option value="">-- Select a profile --</option>
                    ${profiles.map(p => `
                      <option value="${p.id}"
                              ${p.id === genSettings.profileId ? 'selected' : ''}
                              ${!p.isSupported ? 'disabled' : ''}>
                        ${escapeHtml(p.name)}${!p.isSupported ? ' (invalid)' : ''}
                      </option>
                    `).join('')}
                  </select>
                </div>
                <div id="${MODULE_NAME}_profile_info_container">
                  ${renderSelectedProfileInfo(profiles.find(p => p.id === genSettings.profileId))}
                </div>
              ` : `
                <div class="${MODULE_NAME}_profile_empty_notice">
                  <i class="fa-solid fa-info-circle"></i>
                  <div>
                    <strong>No connection profiles found</strong>
                    <p>Create profiles in SillyTavern's Connection Manager to use specific API configurations.</p>
                  </div>
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
                    Leave unchecked to use the profile's preset settings
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
                <span id="${MODULE_NAME}_user_system_prompt_tokens">-- tokens</span>
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
                  <span id="${MODULE_NAME}_base_system_prompt_tokens">-- tokens</span>
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
                <span id="${MODULE_NAME}_user_refinement_prompt_tokens">-- tokens</span>
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
                  <span id="${MODULE_NAME}_base_refinement_prompt_tokens">-- tokens</span>
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
        <span class="${MODULE_NAME}_api_limits">${status.maxOutput.toLocaleString()}t max</span>
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

function renderSelectedProfileInfo(profile: ProfileInfo | undefined): string {
    if (!profile) {
        return `
      <div class="${MODULE_NAME}_profile_info ${MODULE_NAME}_profile_info_empty">
        <i class="fa-solid fa-circle-question"></i>
        <span>Select a profile above</span>
      </div>
    `;
    }

    return `
    <div class="${MODULE_NAME}_profile_info ${!profile.isSupported ? 'error' : ''}">
      <div class="${MODULE_NAME}_profile_info_row">
        <span class="${MODULE_NAME}_profile_info_label">API</span>
        <span class="${MODULE_NAME}_profile_info_value">${escapeHtml(profile.api)}</span>
      </div>
      <div class="${MODULE_NAME}_profile_info_row">
        <span class="${MODULE_NAME}_profile_info_label">Model</span>
        <span class="${MODULE_NAME}_profile_info_value" title="${escapeHtml(profile.model)}">${escapeHtml(truncateModel(profile.model))}</span>
      </div>
      <div class="${MODULE_NAME}_profile_info_row">
        <span class="${MODULE_NAME}_profile_info_label">Type</span>
        <span class="${MODULE_NAME}_api_type_badge ${profile.mode}">${profile.mode === 'cc' ? 'Chat' : 'Text'}</span>
      </div>
      ${profile.presetName ? `
        <div class="${MODULE_NAME}_profile_info_row">
          <span class="${MODULE_NAME}_profile_info_label">Preset</span>
          <span class="${MODULE_NAME}_profile_info_value">${escapeHtml(profile.presetName)}</span>
        </div>
      ` : ''}
      ${!profile.isSupported ? `
        <div class="${MODULE_NAME}_profile_info_error">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>${profile.validationError || 'Profile configuration is invalid'}</span>
        </div>
      ` : ''}
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
// TOKEN COUNT UPDATES
// ============================================================================

function updatePromptTokenCounts(): void {
    const modal = document.getElementById(`${MODULE_NAME}_settings_modal`);
    if (!modal) return;

    const settings = getSettings();

    const prompts: Array<[string, string]> = [
        [`${MODULE_NAME}_user_system_prompt_tokens`, settings.userSystemPrompt || ''],
        [`${MODULE_NAME}_base_system_prompt_tokens`, settings.baseSystemPrompt || ''],
        [`${MODULE_NAME}_user_refinement_prompt_tokens`, settings.userRefinementPrompt || ''],
        [`${MODULE_NAME}_base_refinement_prompt_tokens`, settings.baseRefinementPrompt || ''],
    ];

    for (const [id, text] of prompts) {
        const el = modal.querySelector(`#${id}`);
        if (!el) continue;

        if (!text.trim()) {
            el.textContent = '0 tokens';
            continue;
        }

        // Use debounced countTokens with callback
        countTokens(text, (tokens) => {
            if (tokens !== null) {
                el.textContent = `${tokens.toLocaleString()} tokens`;
            } else {
                el.textContent = '-- tokens';
            }
        }, true); // immediate = true for initial load
    }
}

function updateSingleTokenCount(elementId: string, text: string): void {
    const modal = document.getElementById(`${MODULE_NAME}_settings_modal`);
    if (!modal) return;

    const el = modal.querySelector(`#${elementId}`);
    if (!el) return;

    if (!text.trim()) {
        el.textContent = '0 tokens';
        return;
    }

    // Use debounced countTokens (debounce is built into countTokens)
    countTokens(text, (tokens) => {
        if (tokens !== null) {
            el.textContent = `${tokens.toLocaleString()} tokens`;
        } else {
            el.textContent = '-- tokens';
        }
    });
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function initSettingsListeners(): void {
    const modal = document.getElementById(`${MODULE_NAME}_settings_modal`);
    if (!modal) return;

    // Create debounced update functions for each textarea
    const debouncedUpdateUserSystemPrompt = debounce('userSystemPrompt', (value: string) => {
        updateUserSystemPrompt(value);
    });

    const debouncedUpdateBaseSystemPrompt = debounce('baseSystemPrompt', (value: string) => {
        updateBaseSystemPrompt(value);
    });

    const debouncedUpdateUserRefinementPrompt = debounce('userRefinementPrompt', (value: string) => {
        updateUserRefinementPrompt(value);
    });

    const debouncedUpdateBaseRefinementPrompt = debounce('baseRefinementPrompt', (value: string) => {
        updateBaseRefinementPrompt(value);
    });

    // ========== MODE TOGGLE ==========
    const modeOptions = modal.querySelectorAll(`.${MODULE_NAME}_gen_mode_option`);
    const profileSection = modal.querySelector(`#${MODULE_NAME}_profile_section`);

    modeOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            const element = option as HTMLElement;
            const mode = element.dataset.mode as 'current' | 'profile';

            // Don't do anything if clicking the already-active option
            if (element.classList.contains('active')) {
                return;
            }

            // Prevent double-firing from label + input
            e.stopPropagation();

            const radio = element.querySelector('input[type="radio"]') as HTMLInputElement;
            if (radio) radio.checked = true;

            // Update active states
            modeOptions.forEach(opt => opt.classList.remove('active'));
            element.classList.add('active');

            // Show/hide profile section
            profileSection?.classList.toggle('hidden', mode === 'current');

            // Update settings
            updateGenerationSettings({ mode });

            // Clear token cache - different mode may use different tokenizer
            clearTokenCache();

            refreshApiStatusBanner();
        });
    });

    // ========== PROFILE SELECT ==========
    const profileSelect = modal.querySelector(`#${MODULE_NAME}_profile_select`) as HTMLSelectElement;

    profileSelect?.addEventListener('change', () => {
        const profileId = profileSelect.value || null;
        updateGenerationSettings({ profileId });

        // Clear token cache - different profile may use different tokenizer
        clearTokenCache();

        // Update the profile info display
        const profiles = getAvailableProfiles();
        const selectedProfile = profiles.find(p => p.id === profileId);
        const infoContainer = modal.querySelector(`#${MODULE_NAME}_profile_info_container`);

        if (infoContainer) {
            infoContainer.innerHTML = renderSelectedProfileInfo(selectedProfile);
        }

        refreshApiStatusBanner();
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

        refreshApiStatusBanner();
    });

    maxTokensInput?.addEventListener('change', () => {
        if (!useMaxTokensOverride.checked) return;

        const value = parseInt(maxTokensInput.value, 10);
        if (!isNaN(value) && value >= 100 && value <= 32000) {
            updateGenerationSettings({ maxTokensOverride: value });
            refreshApiStatusBanner();
        }
    });

    // ========== USER SYSTEM PROMPT ==========
    const userSystemPromptTextarea = modal.querySelector(`#${MODULE_NAME}_user_system_prompt`) as HTMLTextAreaElement;
    const clearUserSystemPromptBtn = modal.querySelector(`#${MODULE_NAME}_clear_user_system_prompt`);

    userSystemPromptTextarea?.addEventListener('input', () => {
        debouncedUpdateUserSystemPrompt(userSystemPromptTextarea.value);
        updateSingleTokenCount(`${MODULE_NAME}_user_system_prompt_tokens`, userSystemPromptTextarea.value);
    });

    clearUserSystemPromptBtn?.addEventListener('click', () => {
        resetUserSystemPrompt();
        if (userSystemPromptTextarea) userSystemPromptTextarea.value = '';
        updateSingleTokenCount(`${MODULE_NAME}_user_system_prompt_tokens`, '');
        toastr.info('User system prompt cleared');
    });

    // ========== BASE SYSTEM PROMPT ==========
    const baseSystemPromptTextarea = modal.querySelector(`#${MODULE_NAME}_base_system_prompt`) as HTMLTextAreaElement;
    const resetBaseSystemPromptBtn = modal.querySelector(`#${MODULE_NAME}_reset_base_system_prompt`);

    baseSystemPromptTextarea?.addEventListener('input', () => {
        debouncedUpdateBaseSystemPrompt(baseSystemPromptTextarea.value);
        updateSingleTokenCount(`${MODULE_NAME}_base_system_prompt_tokens`, baseSystemPromptTextarea.value);
    });

    resetBaseSystemPromptBtn?.addEventListener('click', () => {
        resetBaseSystemPrompt();
        if (baseSystemPromptTextarea) baseSystemPromptTextarea.value = BASE_SYSTEM_PROMPT;
        updateSingleTokenCount(`${MODULE_NAME}_base_system_prompt_tokens`, BASE_SYSTEM_PROMPT);
        toastr.info('Base system prompt reset to default');
    });

    // ========== STAGE SYSTEM PROMPTS ==========
    for (const stage of ['score', 'rewrite', 'analyze'] as const) {
        const textarea = modal.querySelector(`#${MODULE_NAME}_stage_system_prompt_${stage}`) as HTMLTextAreaElement;
        if (textarea) {
            const debouncedUpdate = debounce(`stageSystemPrompt_${stage}`, (value: string) => {
                updateStageSystemPrompt(stage, value);
            });
            textarea.addEventListener('input', () => {
                debouncedUpdate(textarea.value);
            });
        }
    }

    // ========== USER REFINEMENT PROMPT ==========
    const userRefinementPromptTextarea = modal.querySelector(`#${MODULE_NAME}_user_refinement_prompt`) as HTMLTextAreaElement;
    const clearUserRefinementPromptBtn = modal.querySelector(`#${MODULE_NAME}_clear_user_refinement_prompt`);

    userRefinementPromptTextarea?.addEventListener('input', () => {
        debouncedUpdateUserRefinementPrompt(userRefinementPromptTextarea.value);
        updateSingleTokenCount(`${MODULE_NAME}_user_refinement_prompt_tokens`, userRefinementPromptTextarea.value);
    });

    clearUserRefinementPromptBtn?.addEventListener('click', () => {
        resetUserRefinementPrompt();
        if (userRefinementPromptTextarea) userRefinementPromptTextarea.value = '';
        updateSingleTokenCount(`${MODULE_NAME}_user_refinement_prompt_tokens`, '');
        toastr.info('User refinement prompt cleared');
    });

    // ========== BASE REFINEMENT PROMPT ==========
    const baseRefinementPromptTextarea = modal.querySelector(`#${MODULE_NAME}_base_refinement_prompt`) as HTMLTextAreaElement;
    const resetBaseRefinementPromptBtn = modal.querySelector(`#${MODULE_NAME}_reset_base_refinement_prompt`);

    baseRefinementPromptTextarea?.addEventListener('input', () => {
        debouncedUpdateBaseRefinementPrompt(baseRefinementPromptTextarea.value);
        updateSingleTokenCount(`${MODULE_NAME}_base_refinement_prompt_tokens`, baseRefinementPromptTextarea.value);
    });

    resetBaseRefinementPromptBtn?.addEventListener('click', () => {
        resetBaseRefinementPrompt();
        if (baseRefinementPromptTextarea) baseRefinementPromptTextarea.value = BASE_REFINEMENT_PROMPT;
        updateSingleTokenCount(`${MODULE_NAME}_base_refinement_prompt_tokens`, BASE_REFINEMENT_PROMPT);
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
            const { Popup } = SillyTavern.getContext();
            const input = await Popup.show.input(
                'Import Presets',
                'Paste your preset JSON here:',
                '',
            );
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

    // Find the section containing the banner
    const section = modal.querySelector(`.${MODULE_NAME}_settings_section`);
    if (!section) return;

    // Remove existing banner and error
    const existingBanner = section.querySelector(`.${MODULE_NAME}_api_banner`);
    const existingError = section.querySelector(`.${MODULE_NAME}_api_error`);
    existingBanner?.remove();
    existingError?.remove();

    // Insert new banner after section header
    const sectionHeader = section.querySelector(`.${MODULE_NAME}_settings_section_header`);
    if (sectionHeader) {
        sectionHeader.insertAdjacentHTML('afterend', renderApiStatusBanner(status));
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
