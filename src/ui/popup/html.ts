// src/ui/popup/html.ts
// Popup HTML template

import { MODULE_NAME, STAGE_ICONS } from '../../constants';
import { getApiInfo } from '../../core/generator';

export function buildPopupContent(): string {
    const apiInfo = getApiInfo();

    return `
    <div class="${MODULE_NAME}_popup" id="${MODULE_NAME}_popup">
      <!-- Header -->
      <div class="${MODULE_NAME}_popup_header">
        <div class="${MODULE_NAME}_popup_title">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          <span>Character Tools</span>
        </div>
        <div class="${MODULE_NAME}_popup_header_right">
          <div class="${MODULE_NAME}_api_status ${apiInfo.isReady ? 'connected' : 'disconnected'}">
            <i class="fa-solid fa-circle"></i>
            <span>${apiInfo.source}</span>
          </div>
          <button id="${MODULE_NAME}_settings_btn" class="${MODULE_NAME}_icon_btn" title="Settings">
            <i class="fa-solid fa-gear"></i>
          </button>
          <button id="${MODULE_NAME}_close_btn" class="${MODULE_NAME}_icon_btn" title="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <!-- Main Content -->
      <div class="${MODULE_NAME}_main_content">
        <!-- Left Column -->
        <div class="${MODULE_NAME}_left_column">
          <div class="${MODULE_NAME}_section" id="${MODULE_NAME}_character_section">
            <div class="${MODULE_NAME}_section_header">
              <i class="fa-solid fa-user"></i>
              <span>Character</span>
            </div>
            <div id="${MODULE_NAME}_character_select_container"></div>
          </div>

          <!-- SESSION SECTION - NEW -->
          <div class="${MODULE_NAME}_section hidden" id="${MODULE_NAME}_session_section">
            <div class="${MODULE_NAME}_section_header">
              <i class="fa-solid fa-folder-open"></i>
              <span>Sessions</span>
            </div>
            <div id="${MODULE_NAME}_session_manager_container"></div>
          </div>

          <div class="${MODULE_NAME}_section" id="${MODULE_NAME}_pipeline_section">
            <div class="${MODULE_NAME}_section_header">
              <i class="fa-solid fa-diagram-project"></i>
              <span>Pipeline</span>
            </div>
            <div id="${MODULE_NAME}_pipeline_nav_container"></div>
          </div>

          <div class="${MODULE_NAME}_section" id="${MODULE_NAME}_stage_section">
            <div class="${MODULE_NAME}_section_header">
              <i class="fa-solid ${STAGE_ICONS.score}" id="${MODULE_NAME}_stage_icon"></i>
              <span id="${MODULE_NAME}_stage_title">Score</span>
            </div>
            <div id="${MODULE_NAME}_stage_config_container"></div>
          </div>
        </div>

        <!-- Right Column -->
        <div class="${MODULE_NAME}_right_column">
          <div class="${MODULE_NAME}_section ${MODULE_NAME}_section_grow" id="${MODULE_NAME}_results_section">
            <div class="${MODULE_NAME}_section_header">
              <i class="fa-solid fa-file-lines"></i>
              <span>Results</span>
              <span id="${MODULE_NAME}_iteration_indicator" class="${MODULE_NAME}_iteration_indicator hidden"></span>
            </div>
            <div id="${MODULE_NAME}_results_container"></div>
          </div>

          <div id="${MODULE_NAME}_iteration_history_container"></div>
        </div>
      </div>
    </div>
  `;
}
