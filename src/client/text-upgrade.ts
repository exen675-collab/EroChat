// @ts-nocheck
import { elements } from './dom.js';
import { state } from './state.js';
import { sendOpenRouterUtilityRequest } from './api-openrouter.js';
import { getActiveRawMessages, getAssistantVisibleText } from './utils.js';
import { showToast } from './notifications.js';

export const TEXT_UPGRADE_MODEL = 'deepseek/deepseek-v4-flash';

const TEXT_UPGRADE_INSTRUCTIONS = {
    minimal:
        'Fix grammar, spelling, punctuation, and obvious wording errors only. Preserve the original meaning, tone, structure, and length as closely as possible.',
    normal:
        'Fix grammar, spelling, punctuation, and improve clarity, sentence structure, flow, and wording a little. Preserve the original meaning and tone.',
    full:
        'Rewrite the text into a stronger, more polished version. Improve grammar, structure, style, detail, and flow, and make it moderately longer while preserving the original meaning and intent.'
};

function normalizeUpgradeMode(mode) {
    return Object.prototype.hasOwnProperty.call(TEXT_UPGRADE_INSTRUCTIONS, mode)
        ? mode
        : 'normal';
}

function normalizeContextMessage(message) {
    if (!message?.role || typeof message.content !== 'string') {
        return null;
    }

    return {
        role: message.role,
        content:
            message.role === 'assistant'
                ? getAssistantVisibleText(message.content)
                : String(message.content).trim()
    };
}

export function buildTextUpgradeMessages({ draft, historyMessages = [], mode = 'normal' }) {
    const normalizedMode = normalizeUpgradeMode(mode);
    const recentMessages = getActiveRawMessages(historyMessages)
        .map(normalizeContextMessage)
        .filter((message) => message?.content)
        .slice(-10);

    const contextText =
        recentMessages.length > 0
            ? recentMessages
                  .map((message, index) => `${index + 1}. ${message.role}: ${message.content}`)
                  .join('\n\n')
            : 'No prior messages.';

    return [
        {
            role: 'system',
            content:
                'You rewrite a user draft for a chat conversation. ' +
                'Use the recent conversation only to preserve names, references, and tone. ' +
                'Return only the upgraded draft text, with no quotation marks, labels, markdown, or commentary.'
        },
        {
            role: 'user',
            content: `Upgrade level: ${normalizedMode}

Instruction: ${TEXT_UPGRADE_INSTRUCTIONS[normalizedMode]}

Recent conversation:
${contextText}

Draft to upgrade:
${String(draft || '').trim()}`
        }
    ];
}

function setUpgradeButtonBusy(isBusy) {
    if (!elements.upgradeTextBtn) return;

    elements.upgradeTextBtn.disabled = isBusy;
    elements.upgradeTextBtn.classList.toggle('opacity-60', isBusy);
    elements.upgradeTextBtn.classList.toggle('cursor-not-allowed', isBusy);
    elements.upgradeTextBtn.querySelector('span').textContent = isBusy ? 'Upgrading...' : 'Upgrade';
}

function updateUpgradeModeMenu(mode) {
    const normalizedMode = normalizeUpgradeMode(mode);
    if (elements.textUpgradeMode) {
        elements.textUpgradeMode.value = normalizedMode;
    }

    elements.textUpgradeMenu
        ?.querySelectorAll('[data-upgrade-mode]')
        .forEach((button) => {
            button.classList.toggle(
                'is-active',
                button.getAttribute('data-upgrade-mode') === normalizedMode
            );
        });
}

export function closeTextUpgradeMenu() {
    elements.textUpgradeMenu?.classList.add('hidden');
    elements.upgradeTextMenuBtn?.setAttribute('aria-expanded', 'false');
}

export function toggleTextUpgradeMenu() {
    if (!elements.textUpgradeMenu || !elements.upgradeTextMenuBtn) return;

    const shouldOpen = elements.textUpgradeMenu.classList.contains('hidden');
    elements.textUpgradeMenu.classList.toggle('hidden', !shouldOpen);
    elements.upgradeTextMenuBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    updateUpgradeModeMenu(elements.textUpgradeMode?.value);
}

export function selectTextUpgradeMode(mode) {
    updateUpgradeModeMenu(mode);
    closeTextUpgradeMenu();
}

export async function upgradeCurrentDraft() {
    const draft = elements.messageInput.value.trim();
    if (!draft) {
        showToast('Write something first, then upgrade it.', { type: 'warning' });
        return;
    }

    if (!elements.openrouterKey?.value) {
        showToast('Please enter your OpenRouter API key in settings.', { type: 'warning' });
        return;
    }

    setUpgradeButtonBusy(true);

    try {
        const upgradedText = await sendOpenRouterUtilityRequest({
            model: TEXT_UPGRADE_MODEL,
            messages: buildTextUpgradeMessages({
                draft,
                historyMessages: state.messages,
                mode: elements.textUpgradeMode?.value
            })
        });

        const normalized = String(upgradedText || '').trim();
        if (!normalized) {
            throw new Error('The model returned an empty rewrite.');
        }

        elements.messageInput.value = normalized;
        elements.messageInput.dispatchEvent(new Event('input'));
        elements.messageInput.focus();
    } catch (error) {
        console.error('Text upgrade failed:', error);
        showToast(`Failed to upgrade text: ${error.message}`, { type: 'error' });
    } finally {
        setUpgradeButtonBusy(false);
    }
}
