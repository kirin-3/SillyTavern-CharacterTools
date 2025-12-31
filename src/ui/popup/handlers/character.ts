// src/ui/popup/handlers/character.ts
// Character selection handlers

import { MODULE_NAME } from '../../../constants';
import { debugLog } from '../../../debug';
import { getPopulatedFields } from '../../../character';
import { setCharacter, updateFieldSelection, selectAllFields, deselectAllFields } from '../../../pipeline';
import { loadCharacterSessions, restorePipelineFromSession } from '../../../persistence';
import { renderDropdownItems, updateFieldTokenCounts } from '../../components/character-select';
import { getState, getElement, addCleanupFunction } from '../state';
import { updateAllComponents, updateCharacterSelect, updateTokenEstimate, updateSessionManager, updateIterationHistory, updateResultsPanel, updatePipelineNav } from '../updaters';
import type { Character } from '../../../types';

let characterSelectInitialized = false;

export function resetCharacterSelectInit(): void {
    characterSelectInitialized = false;
}

export function isCharacterSelectInitialized(): boolean {
    return characterSelectInitialized;
}

export function initCharacterSelectListeners(): void {
    const el = getElement();
    const state = getState();
    if (!el || !state) return;

    if (characterSelectInitialized) {
        debugLog('info', 'Character select listeners already initialized, skipping', null);
        return;
    }

    const { Fuse, lodash } = SillyTavern.libs;

    const container = el.querySelector(`#${MODULE_NAME}_character_select_container`);
    if (!container) return;

    const searchInput = container.querySelector(`#${MODULE_NAME}_char_search`) as HTMLInputElement;
    const dropdown = container.querySelector(`#${MODULE_NAME}_char_dropdown`) as HTMLElement;

    if (!searchInput || !dropdown) return;

    characterSelectInitialized = true;

    let selectedIndex = -1;
    let currentResults: Array<{ char: Character; index: number }> = [];

    const handleSearch = () => {
        const { characters } = SillyTavern.getContext();
        const currentChars = characters as Character[];

        const currentCharData = currentChars
            .map((char, index) => ({ char, index }))
            .filter(({ char }) => char?.name);

        const fuse = new Fuse(currentCharData, {
            keys: ['char.name', 'char.description'],
            threshold: 0.4,
            includeScore: true,
            minMatchCharLength: 1,
        });

        const query = searchInput.value.trim();

        if (!query) {
            dropdown.classList.add('hidden');
            currentResults = [];
            return;
        }

        const results = fuse.search(query, { limit: 10 });
        currentResults = results.map((r: { item: { char: Character; index: number } }) => r.item);

        if (currentResults.length === 0) {
            dropdown.innerHTML = `<div class="${MODULE_NAME}_dropdown_empty">No characters found</div>`;
            dropdown.classList.remove('hidden');
            return;
        }

        selectedIndex = -1;
        renderDropdownItems(currentResults, dropdown, -1);
        dropdown.classList.remove('hidden');
    };

    const debouncedSearch = lodash.debounce(handleSearch, 150);
    state.debouncedFunctions.push(debouncedSearch);
    searchInput.addEventListener('input', debouncedSearch);

    searchInput.addEventListener('keydown', (e) => {
        if (currentResults.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
            renderDropdownItems(currentResults, dropdown, selectedIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            renderDropdownItems(currentResults, dropdown, selectedIndex);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            selectCharacter(currentResults[selectedIndex].char, currentResults[selectedIndex].index);
            dropdown.classList.add('hidden');
            searchInput.value = '';
        } else if (e.key === 'Escape') {
            dropdown.classList.add('hidden');
            searchInput.value = '';
        }
    });

    // Document click handler to close dropdown
    const handleDocumentClick = (e: MouseEvent) => {
        if (!searchInput.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
            dropdown.classList.add('hidden');
        }
    };
    document.addEventListener('click', handleDocumentClick);

    // Register cleanup function properly
    addCleanupFunction(() => {
        document.removeEventListener('click', handleDocumentClick);
    });

    dropdown.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent bubbling to container
        const item = (e.target as HTMLElement).closest(`.${MODULE_NAME}_dropdown_item`);
        if (item) {
            const index = parseInt(item.getAttribute('data-index') || '-1', 10);
            const charItem = currentResults.find(c => c.index === index);
            if (charItem) {
                selectCharacter(charItem.char, charItem.index);
                dropdown.classList.add('hidden');
                searchInput.value = '';
            }
        }
    });


    container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const s = getState();
        if (!s) return;

        if (target.closest(`#${MODULE_NAME}_char_clear`)) {
            s.pipeline = setCharacter(s.pipeline, null, null);
            s.sessionsLoaded = false;
            updateAllComponents();
            return;
        }

        if (target.closest(`#${MODULE_NAME}_select_all_fields`) && s.pipeline.character) {
            s.pipeline = selectAllFields(s.pipeline);
            updateCharacterSelect();
            updateTokenEstimate();
            return;
        }

        if (target.closest(`#${MODULE_NAME}_select_none_fields`)) {
            s.pipeline = deselectAllFields(s.pipeline);
            updateCharacterSelect();
            updateTokenEstimate();
            return;
        }

        const expandBtn = target.closest(`.${MODULE_NAME}_field_expand_btn`);
        if (expandBtn) {
            e.preventDefault();
            e.stopPropagation();
            const fieldKey = expandBtn.getAttribute('data-field');
            const content = container.querySelector(`#${MODULE_NAME}_field_content_${fieldKey}`);
            const icon = expandBtn.querySelector('i');

            if (content && icon) {
                content.classList.toggle('hidden');
                icon.classList.toggle('fa-chevron-right');
                icon.classList.toggle('fa-chevron-down');
            }
            return;
        }
    });

    container.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const s = getState();
        if (!s) return;

        if (target.classList.contains(`${MODULE_NAME}_field_checkbox`)) {
            const fieldKey = target.dataset.field!;
            const isArray = target.dataset.isArray === 'true';

            if (isArray) {
                const field = getPopulatedFields(s.pipeline.character!).find(f => f.key === fieldKey);
                if (field && Array.isArray(field.rawValue)) {
                    const newValue = target.checked
                        ? (field.rawValue as string[]).map((_, i) => i)
                        : [];
                    s.pipeline = updateFieldSelection(s.pipeline, fieldKey, newValue);
                }
            } else {
                s.pipeline = updateFieldSelection(s.pipeline, fieldKey, target.checked);
            }

            updateCharacterSelect();
            updateTokenEstimate();
            return;
        }

        if (target.classList.contains(`${MODULE_NAME}_alt_greeting_checkbox`)) {
            const fieldKey = target.dataset.field!;
            const index = parseInt(target.dataset.index!, 10);

            const current = (s.pipeline.selectedFields[fieldKey] as number[]) || [];
            let newValue: number[];

            if (target.checked) {
                newValue = [...current, index].sort((a, b) => a - b);
            } else {
                newValue = current.filter(i => i !== index);
            }

            s.pipeline = updateFieldSelection(s.pipeline, fieldKey, newValue);
            updateCharacterSelect();
            updateTokenEstimate();
        }
    });
}

let isSelectingCharacter = false;

export async function selectCharacter(char: Character, index: number): Promise<void> {
    const state = getState();
    const el = getElement();
    if (!state || !el) return;

    // Prevent re-entry
    if (isSelectingCharacter) {
        debugLog('info', 'Already selecting character, ignoring', null);
        return;
    }

    isSelectingCharacter = true;
    const selectedIndex = index;

    try {
        const { unshallowCharacter, characters } = SillyTavern.getContext();

        try {
            await unshallowCharacter(index);
        } catch (e) {
            debugLog('error', 'Failed to unshallow character', { index, name: char.name, error: e });
            toastr.error(`Failed to load character data for ${char.name}`);
            return;
        }

        // Re-acquire state after async operation
        const s = getState();
        const currentEl = getElement();
        if (!s || !currentEl) {
            debugLog('info', 'Popup closed during character load', null);
            return;
        }

        const charList = characters as Character[];

        if (index < 0 || index >= charList.length) {
            debugLog('error', 'Character index out of bounds after unshallow', { index, listLength: charList.length });
            toastr.error('Character no longer available');
            return;
        }

        const fullChar = charList[index];

        if (!fullChar || !fullChar.name) {
            debugLog('error', 'Character data invalid after unshallow', { index, char: fullChar });
            toastr.error('Failed to load character data');
            return;
        }

        const populatedFields = getPopulatedFields(fullChar);
        if (populatedFields.length === 0) {
            debugLog('info', 'Character has no populated fields', { name: fullChar.name });
            toastr.warning(`${fullChar.name} has no content to analyze`);
        }

        // Set character first
        s.pipeline = setCharacter(s.pipeline, fullChar, index);
        s.sessionsLoaded = false;
        s.sessions = [];
        s.activeSessionId = null;

        updateAllComponents();

        // Load sessions for this character (non-blocking)
        loadCharacterSessions(fullChar).then(async data => {
            const currentState = getState();
            if (!currentState || currentState.pipeline.characterIndex !== selectedIndex) {
                debugLog('info', 'Character changed during session load, discarding', null);
                return;
            }

            currentState.sessions = data.sessions;
            currentState.activeSessionId = data.activeSessionId;
            currentState.sessionsLoaded = true;

            // If there's an active session, restore it
            if (data.activeSessionId && data.sessions.length > 0) {
                const activeSession = data.sessions.find(s => s.id === data.activeSessionId);
                if (activeSession) {
                    currentState.pipeline = restorePipelineFromSession(
                        activeSession,
                        fullChar,
                        selectedIndex,
                    );
                    debugLog('info', 'Restored active session', {
                        sessionId: data.activeSessionId,
                        label: activeSession.label,
                    });
                    toastr.info(`Restored: ${activeSession.label}`);
                }
            }

            // Only update session-related components, not everything
            updateSessionManager();
            updateIterationHistory();
            updateResultsPanel();
            updatePipelineNav();
        }).catch(e => {
            debugLog('error', 'Failed to load sessions', e);
            const currentState = getState();
            if (currentState) {
                currentState.sessionsLoaded = true;
                updateSessionManager();
            }
        });

        // Update token counts (non-blocking)
        setTimeout(async () => {
            const currentEl = getElement();
            const currentState = getState();
            if (!currentEl || !currentState?.pipeline.character) return;
            if (currentState.pipeline.characterIndex !== selectedIndex) return;

            const container = currentEl.querySelector(`#${MODULE_NAME}_character_select_container`);
            if (container) {
                const fields = getPopulatedFields(currentState.pipeline.character);
                await updateFieldTokenCounts(container as HTMLElement, fields);
            }
        }, 50);

        debugLog('info', 'Character selected', {
            name: fullChar.name,
            index,
            fieldCount: populatedFields.length,
        });
    } finally {
        isSelectingCharacter = false;
    }
}
