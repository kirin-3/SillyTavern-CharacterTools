// src/ui/components/session-manager.ts
//
// Session management UI component

import { MODULE_NAME } from '../../../constants';
import type { PersistedSession } from '../../../types';

// ============================================================================
// RENDER
// ============================================================================

/**
 * Render the session manager component
 */
export function renderSessionManager(
    sessions: PersistedSession[],
    activeSessionId: string | null,
    hasUnsavedChanges: boolean,
): string {
    const { moment } = SillyTavern.libs;

    const activeSession = sessions.find(s => s.id === activeSessionId);
    const summaryText = activeSession
        ? `${activeSession.label}`
        : `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`;

    return `
    <div class="${MODULE_NAME}_session_manager" id="${MODULE_NAME}_session_manager">
      <div class="${MODULE_NAME}_session_header">
        <div class="${MODULE_NAME}_session_title">
          <i class="fa-solid fa-folder-open"></i>
          <span>Sessions</span>
          ${hasUnsavedChanges ? `<span class="${MODULE_NAME}_unsaved_indicator" title="Unsaved changes">●</span>` : ''}
        </div>
        <div class="${MODULE_NAME}_session_header_actions">
          <button id="${MODULE_NAME}_save_session_btn" class="${MODULE_NAME}_icon_btn" title="Save current session">
            <i class="fa-solid fa-floppy-disk"></i>
          </button>
          <button id="${MODULE_NAME}_new_session_btn" class="${MODULE_NAME}_icon_btn" title="Start new session">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>

      <details class="${MODULE_NAME}_session_list_details" ${sessions.length > 0 ? 'open' : ''}>
        <summary class="${MODULE_NAME}_session_list_summary">
          <span>${summaryText}</span>
          <i class="fa-solid fa-chevron-down"></i>
        </summary>
        <div class="${MODULE_NAME}_session_list" id="${MODULE_NAME}_session_list">
          ${sessions.length === 0
        ? `<div class="${MODULE_NAME}_session_empty">No saved sessions</div>`
        : sessions.map(s => renderSessionItem(s, s.id === activeSessionId, moment)).join('')
}
        </div>
        ${sessions.length > 0 ? `
          <div class="${MODULE_NAME}_session_footer">
            <button id="${MODULE_NAME}_clear_all_sessions_btn" class="menu_button menu_button_icon" title="Delete all sessions for this character">
              <i class="fa-solid fa-trash"></i>
              <span>Clear All</span>
            </button>
          </div>
        ` : ''}
      </details>
    </div>
  `;
}


/**
 * Render a single session item
 */
function renderSessionItem(
    session: PersistedSession,
    isActive: boolean,
    moment: typeof SillyTavern.libs.moment,
): string {
    const hasResults = !!(session.results.score || session.results.rewrite || session.results.analyze);
    const stageCount = [session.results.score, session.results.rewrite, session.results.analyze]
        .filter(Boolean).length;

    const statusParts: string[] = [];
    if (session.iterationCount > 0) {
        statusParts.push(`${session.iterationCount} iter`);
    }
    if (stageCount > 0) {
        statusParts.push(`${stageCount}/3 stages`);
    }

    return `
    <div class="${MODULE_NAME}_session_item ${isActive ? 'active' : ''}" data-session-id="${session.id}">
      <div class="${MODULE_NAME}_session_item_main">
        <div class="${MODULE_NAME}_session_item_info">
          <span class="${MODULE_NAME}_session_label">${escapeHtml(session.label)}</span>
          <span class="${MODULE_NAME}_session_meta">
            ${moment(session.updatedAt).fromNow()}
            ${statusParts.length > 0 ? ` • ${statusParts.join(' • ')}` : ''}
          </span>
        </div>
        <div class="${MODULE_NAME}_session_item_actions">
          ${!isActive ? `
            <button class="${MODULE_NAME}_session_load_btn ${MODULE_NAME}_icon_btn" data-session-id="${session.id}" title="Load this session">
              <i class="fa-solid fa-folder-open"></i>
            </button>
          ` : `
            <span class="${MODULE_NAME}_session_active_badge">Active</span>
          `}
          <button class="${MODULE_NAME}_session_rename_btn ${MODULE_NAME}_icon_btn" data-session-id="${session.id}" title="Rename">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="${MODULE_NAME}_session_delete_btn ${MODULE_NAME}_icon_btn" data-session-id="${session.id}" title="Delete">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      ${hasResults ? renderSessionPreview(session) : ''}
    </div>
  `;
}

/**
 * Render a preview of session results
 */
function renderSessionPreview(session: PersistedSession): string {
    const stages: string[] = [];

    if (session.results.score) {
        stages.push('<i class="fa-solid fa-star-half-stroke" title="Score"></i>');
    }
    if (session.results.rewrite) {
        stages.push('<i class="fa-solid fa-pen-fancy" title="Rewrite"></i>');
    }
    if (session.results.analyze) {
        stages.push('<i class="fa-solid fa-magnifying-glass-chart" title="Analyze"></i>');
    }

    return `
    <div class="${MODULE_NAME}_session_preview">
      <span class="${MODULE_NAME}_session_stages">${stages.join(' ')}</span>
    </div>
  `;
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update session manager state
 */
export function updateSessionManagerState(
    container: HTMLElement,
    sessions: PersistedSession[],
    activeSessionId: string | null,
    hasUnsavedChanges: boolean,
): void {
    const manager = container.querySelector(`#${MODULE_NAME}_session_manager`);
    if (!manager) return;

    // Update unsaved indicator
    const title = manager.querySelector(`.${MODULE_NAME}_session_title`);
    const indicator = manager.querySelector(`.${MODULE_NAME}_unsaved_indicator`);
    if (hasUnsavedChanges && !indicator && title) {
        title.insertAdjacentHTML('beforeend', `<span class="${MODULE_NAME}_unsaved_indicator" title="Unsaved changes">●</span>`);
    } else if (!hasUnsavedChanges && indicator) {
        indicator.remove();
    }

    // Update summary text
    const summary = manager.querySelector(`.${MODULE_NAME}_session_list_summary span`);
    if (summary) {
        const activeSession = sessions.find(s => s.id === activeSessionId);
        summary.textContent = activeSession
            ? activeSession.label
            : `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`;
    }

    // Update session list
    const list = manager.querySelector(`#${MODULE_NAME}_session_list`);
    if (list) {
        const { moment } = SillyTavern.libs;

        if (sessions.length === 0) {
            list.innerHTML = `<div class="${MODULE_NAME}_session_empty">No saved sessions</div>`;
        } else {
            list.innerHTML = sessions.map(s =>
                renderSessionItem(s, s.id === activeSessionId, moment),
            ).join('');
        }
    }

    // Update footer visibility
    const details = manager.querySelector(`.${MODULE_NAME}_session_list_details`);
    const footer = manager.querySelector(`.${MODULE_NAME}_session_footer`);

    if (sessions.length > 0 && !footer && details) {
        details.insertAdjacentHTML('beforeend', `
      <div class="${MODULE_NAME}_session_footer">
        <button id="${MODULE_NAME}_clear_all_sessions_btn" class="menu_button menu_button_icon" title="Delete all sessions for this character">
          <i class="fa-solid fa-trash"></i>
          <span>Clear All</span>
        </button>
      </div>
    `);
    } else if (sessions.length === 0 && footer) {
        footer.remove();
    }
}


// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(value: unknown): string {
    const { DOMPurify } = SillyTavern.libs;
    const str = typeof value === 'string' ? value : String(value ?? '');
    return DOMPurify.sanitize(str, { ALLOWED_TAGS: [] });
}
