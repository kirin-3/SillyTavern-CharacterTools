// src/ui/popup/components/session-manager.ts
//
// Session management UI component - unified header with collapsible list

import { MODULE_NAME } from '../../../constants';
import type { PersistedSession } from '../../../types';

// ============================================================================
// RENDER
// ============================================================================

/**
 * Render the session manager component
 * This is now a self-contained component, not wrapped in a section
 */
export function renderSessionManager(
    sessions: PersistedSession[],
    activeSessionId: string | null,
    hasUnsavedChanges: boolean,
    isExpanded: boolean,
    isLoading: boolean,
): string {
    const { moment } = SillyTavern.libs;

    if (isLoading) {
        return `
            <div class="${MODULE_NAME}_session_manager" id="${MODULE_NAME}_session_manager">
                <div class="${MODULE_NAME}_session_header">
                    <div class="${MODULE_NAME}_session_header_left">
                        <i class="fa-solid fa-folder-open"></i>
                        <span class="${MODULE_NAME}_session_title_text">Sessions</span>
                        <i class="fa-solid fa-spinner fa-spin ${MODULE_NAME}_session_loading_icon"></i>
                    </div>
                </div>
            </div>
        `;
    }

    const count = sessions.length;
    const chevronClass = isExpanded ? 'fa-chevron-up' : 'fa-chevron-down';

    return `
        <div class="${MODULE_NAME}_session_manager ${isExpanded ? 'expanded' : 'collapsed'}" id="${MODULE_NAME}_session_manager">
            <div class="${MODULE_NAME}_session_header" id="${MODULE_NAME}_session_header">
                <div class="${MODULE_NAME}_session_header_left" id="${MODULE_NAME}_session_toggle">
                    <i class="fa-solid fa-folder-open"></i>
                    <span class="${MODULE_NAME}_session_title_text">Sessions (${count})</span>
                    ${hasUnsavedChanges ? `<span class="${MODULE_NAME}_unsaved_dot" title="Unsaved changes">●</span>` : ''}
                </div>
                <div class="${MODULE_NAME}_session_header_actions">
                    <button id="${MODULE_NAME}_save_session_btn" class="${MODULE_NAME}_icon_btn" title="Save current session">
                        <i class="fa-solid fa-floppy-disk"></i>
                    </button>
                    <button id="${MODULE_NAME}_new_session_btn" class="${MODULE_NAME}_icon_btn" title="Start new session">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                    <button id="${MODULE_NAME}_session_toggle_btn" class="${MODULE_NAME}_icon_btn" title="${isExpanded ? 'Collapse' : 'Expand'}">
                        <i class="fa-solid ${chevronClass}"></i>
                    </button>
                </div>
            </div>
            <div class="${MODULE_NAME}_session_list_container ${isExpanded ? '' : 'hidden'}" id="${MODULE_NAME}_session_list_container">
                ${count === 0
        ? `<div class="${MODULE_NAME}_session_empty">No saved sessions</div>`
        : `<div class="${MODULE_NAME}_session_list" id="${MODULE_NAME}_session_list">
                        ${sessions.map(s => renderSessionItem(s, s.id === activeSessionId, moment)).join('')}
                       </div>
                       <div class="${MODULE_NAME}_session_list_footer">
                           <button id="${MODULE_NAME}_clear_all_sessions_btn" class="menu_button menu_button_icon">
                               <i class="fa-solid fa-trash"></i>
                               <span>Clear All</span>
                           </button>
                       </div>`
}
            </div>
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
    const stageCount = [session.results.score, session.results.rewrite, session.results.analyze]
        .filter(Boolean).length;

    const metaParts: string[] = [moment(session.updatedAt).fromNow()];
    if (session.iterationCount > 0) {
        metaParts.push(`${session.iterationCount} iter`);
    }
    if (stageCount > 0) {
        metaParts.push(`${stageCount}/3`);
    }

    return `
        <div class="${MODULE_NAME}_session_item ${isActive ? 'active' : ''}" data-session-id="${session.id}">
            <div class="${MODULE_NAME}_session_item_left">
                <span class="${MODULE_NAME}_session_indicator">${isActive ? '●' : '○'}</span>
                <div class="${MODULE_NAME}_session_item_info">
                    <span class="${MODULE_NAME}_session_label">${escapeHtml(session.label)}</span>
                    <span class="${MODULE_NAME}_session_meta">${metaParts.join(' • ')}</span>
                </div>
            </div>
            <div class="${MODULE_NAME}_session_item_actions">
                ${!isActive ? `
                    <button class="${MODULE_NAME}_session_load_btn ${MODULE_NAME}_icon_btn" data-session-id="${session.id}" title="Load">
                        <i class="fa-solid fa-folder-open"></i>
                    </button>
                ` : ''}
                <button class="${MODULE_NAME}_session_rename_btn ${MODULE_NAME}_icon_btn" data-session-id="${session.id}" title="Rename">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="${MODULE_NAME}_session_delete_btn ${MODULE_NAME}_icon_btn" data-session-id="${session.id}" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update session manager state without full re-render when possible
 */
export function updateSessionManagerState(
    container: HTMLElement,
    sessions: PersistedSession[],
    activeSessionId: string | null,
    hasUnsavedChanges: boolean,
    isExpanded: boolean,
    isLoading: boolean,
): void {
    const manager = container.querySelector(`#${MODULE_NAME}_session_manager`);
    if (!manager) return;

    // Check if we're transitioning from loading state
    const wasLoading = manager.querySelector(`.${MODULE_NAME}_session_loading_icon`) !== null;

    // If loading, show loading state
    if (isLoading) {
        manager.innerHTML = `
            <div class="${MODULE_NAME}_session_header">
                <div class="${MODULE_NAME}_session_header_left">
                    <i class="fa-solid fa-folder-open"></i>
                    <span class="${MODULE_NAME}_session_title_text">Sessions</span>
                    <i class="fa-solid fa-spinner fa-spin ${MODULE_NAME}_session_loading_icon"></i>
                </div>
            </div>
        `;
        return;
    }

    // If transitioning from loading to loaded, full re-render
    if (wasLoading) {
        container.innerHTML = renderSessionManager(sessions, activeSessionId, hasUnsavedChanges, isExpanded, false);
        return;
    }


    // Update expanded/collapsed class
    manager.classList.toggle('expanded', isExpanded);
    manager.classList.toggle('collapsed', !isExpanded);

    // Update title with count
    const titleText = manager.querySelector(`.${MODULE_NAME}_session_title_text`);
    if (titleText) {
        titleText.textContent = `Sessions (${sessions.length})`;
    }

    // Update unsaved indicator
    const headerLeft = manager.querySelector(`.${MODULE_NAME}_session_header_left`);
    const existingDot = headerLeft?.querySelector(`.${MODULE_NAME}_unsaved_dot`);
    if (hasUnsavedChanges && !existingDot && headerLeft) {
        headerLeft.insertAdjacentHTML('beforeend', `<span class="${MODULE_NAME}_unsaved_dot" title="Unsaved changes">●</span>`);
    } else if (!hasUnsavedChanges && existingDot) {
        existingDot.remove();
    }

    // Update chevron
    const toggleBtn = manager.querySelector(`#${MODULE_NAME}_session_toggle_btn i`);
    if (toggleBtn) {
        toggleBtn.className = `fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`;
    }

    // Update list container visibility
    const listContainer = manager.querySelector(`#${MODULE_NAME}_session_list_container`);
    if (listContainer) {
        listContainer.classList.toggle('hidden', !isExpanded);
    }

    // Update list contents
    const list = manager.querySelector(`#${MODULE_NAME}_session_list`);
    if (list) {
        const { moment } = SillyTavern.libs;
        if (sessions.length === 0) {
            const containerEl = manager.querySelector(`#${MODULE_NAME}_session_list_container`);
            if (containerEl) {
                containerEl.innerHTML = `<div class="${MODULE_NAME}_session_empty">No saved sessions</div>`;
            }
        } else {
            list.innerHTML = sessions.map(s =>
                renderSessionItem(s, s.id === activeSessionId, moment),
            ).join('');
        }
    }

    // Ensure footer exists if we have sessions
    const footer = manager.querySelector(`.${MODULE_NAME}_session_list_footer`);
    const listContainerEl = manager.querySelector(`#${MODULE_NAME}_session_list_container`);
    if (sessions.length > 0 && !footer && listContainerEl) {
        listContainerEl.insertAdjacentHTML('beforeend', `
            <div class="${MODULE_NAME}_session_list_footer">
                <button id="${MODULE_NAME}_clear_all_sessions_btn" class="menu_button menu_button_icon">
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
