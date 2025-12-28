// src/ui/panel.ts
//
// Extension panel - minimal, just the launch button.

import { MODULE_NAME, EXTENSION_PATH, VERSION } from '../constants';
import { debugLog, logError } from '../debug';
import { openMainPopup } from './popup';

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the extension panel in ST's extensions settings
 */
export async function initPanel(): Promise<void> {
    const { renderExtensionTemplateAsync } = SillyTavern.getContext();

    const container = document.getElementById('extensions_settings');
    if (!container) {
        logError('Extensions container not found', null);
        return;
    }

    try {
        const html = await renderExtensionTemplateAsync(
            EXTENSION_PATH,
            'templates/panel',
            { version: VERSION },
            true,
        );

        const wrapper = document.createElement('div');
        wrapper.id = `${MODULE_NAME}_wrapper`;
        wrapper.innerHTML = html;
        container.appendChild(wrapper);

        initEventListeners();

        debugLog('info', 'Panel initialized', null);
    } catch (error) {
        logError('Failed to load panel template', error);
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function initEventListeners(): void {
    const openBtn = document.getElementById(`${MODULE_NAME}_open_btn`);
    openBtn?.addEventListener('click', () => {
        openMainPopup();
    });
}
