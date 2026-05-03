import { state } from './state.js';
import { elements } from './dom.js';
import { sendOpenRouterChatRequest } from './api-openrouter.js';
import { saveToLocalStorage } from './storage.js';
import { renderMessages } from './messages.js';
import {
    escapeHtml,
    generateId,
    getActiveRawMessages,
    normalizeContextMessageCount,
    stripImagePromptBlocks
} from './utils.js';
import { showToast } from './notifications.js';

export const MEMORY_COMPRESSION_MODEL = 'anthropic/claude-sonnet-4.6';

function getCurrentChatRecord() {
    return (
        state.characters.find((character) => character.id === state.currentCharacterId) ||
        state.characters.find((character) => character.id === 'default') ||
        null
    );
}

export function getCurrentChatContextLimit() {
    const chat = getCurrentChatRecord();
    return normalizeContextMessageCount(
        chat?.contextMessageCount ?? state.settings.contextMessageCount,
        state.settings.contextMessageCount
    );
}

export function setCurrentChatContextLimit(value) {
    const limit = normalizeContextMessageCount(value, getCurrentChatContextLimit());
    const chat = getCurrentChatRecord();
    if (chat) {
        chat.contextMessageCount = limit;
    }
    state.settings.contextMessageCount = limit;
    if (elements.contextMessageCount) {
        elements.contextMessageCount.value = limit;
    }
    return limit;
}

export function getCurrentMemorySnapshots() {
    const chat = getCurrentChatRecord();
    if (!chat) return [];
    if (!Array.isArray(chat.memorySnapshots)) {
        chat.memorySnapshots = [];
    }
    return chat.memorySnapshots;
}

export function getMemoryPressureState(
    messages = state.messages,
    limit = getCurrentChatContextLimit()
) {
    const activeMessages = getActiveRawMessages(messages);
    const threshold = limit * 2;
    return {
        limit,
        threshold,
        activeCount: activeMessages.length,
        archivedCount: Array.isArray(messages)
            ? messages.filter((message) => message?.archivedFromModelContext === true).length
            : 0,
        snapshotCount: getCurrentMemorySnapshots().length,
        isBlocked: activeMessages.length >= threshold
    };
}

export function getCompressionBlock(
    messages = state.messages,
    limit = getCurrentChatContextLimit()
) {
    return getActiveRawMessages(messages).slice(0, limit);
}

function buildCompressionMessages(block, instructions = '') {
    const transcript = block
        .map((message, index) => {
            const label = message.role === 'assistant' ? 'Assistant' : 'User';
            return `${index + 1}. ${label}: ${stripImagePromptBlocks(message.content).trim()}`;
        })
        .join('\n\n');

    const instructionText = String(instructions || '').trim();

    return [
        {
            role: 'system',
            content:
                'Summarize the provided chat transcript as a plain narrative memory of what happened. Do not use headings, bullet points, labels, JSON, or structured sections. Preserve important continuity, facts, emotional beats, decisions, and user preferences. Return only the memory text.'
        },
        {
            role: 'user',
            content: `${instructionText ? `One-time user guidance for this regeneration: ${instructionText}\n\n` : ''}Transcript to compress:\n\n${transcript}`
        }
    ];
}

export async function generateMemorySummary(instructions = '') {
    const limit = getCurrentChatContextLimit();
    const block = getCompressionBlock(state.messages, limit);

    if (block.length !== limit) {
        throw new Error(`Need exactly ${limit} active messages to compress.`);
    }

    return sendOpenRouterChatRequest({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${elements.openrouterKey.value}`,
            'HTTP-Referer': window.location.href,
            'X-Title': 'EroChat'
        },
        body: {
            model: MEMORY_COMPRESSION_MODEL,
            messages: buildCompressionMessages(block, instructions),
            temperature: 0.35,
            max_tokens: 1200
        }
    });
}

function setMemoryDraft(nextDraft) {
    state.memoryCompressionDraft = nextDraft;
}

function getDraftTextareaValue() {
    return elements.memoryPanel?.querySelector('#memoryReviewText')?.value || '';
}

function getInstructionValue() {
    return elements.memoryPanel?.querySelector('#memoryInstructions')?.value || '';
}

export function acceptMemorySummary() {
    const draft = state.memoryCompressionDraft;
    const finalText = getDraftTextareaValue();

    if (!draft || !finalText.trim()) {
        showToast('Memory summary cannot be empty.', { type: 'warning' });
        return;
    }

    const limit = getCurrentChatContextLimit();
    const block = getCompressionBlock(state.messages, limit);
    if (block.length !== limit) {
        showToast('The compression block changed. Regenerate before saving.', { type: 'error' });
        return;
    }

    const sourceIndexes = block.map((message) => state.messages.indexOf(message));
    const snapshotId = generateId();
    const snapshot = {
        id: snapshotId,
        model: MEMORY_COMPRESSION_MODEL,
        sourceMessageStartIndex: Math.min(...sourceIndexes) + 1,
        sourceMessageEndIndex: Math.max(...sourceIndexes) + 1,
        sourceMessageIds: block.map((message) => message.id).filter(Boolean),
        generatedText: draft.generatedText,
        finalText,
        createdAt: draft.createdAt,
        acceptedAt: new Date().toISOString()
    };

    getCurrentMemorySnapshots().push(snapshot);
    block.forEach((message) => {
        message.archivedFromModelContext = true;
        message.archivedMemorySnapshotId = snapshotId;
    });

    setMemoryDraft(null);
    saveToLocalStorage();
    renderMessages();
    renderMemoryPanel();
    showToast('Memory snapshot saved.', { type: 'success' });
}

export function rejectMemorySummary() {
    setMemoryDraft(null);
    renderMemoryPanel();
    showToast('Memory rejected. Choose compression again or increase the limit.', {
        type: 'warning'
    });
}

export async function startMemoryCompression() {
    if (!elements.openrouterKey.value) {
        showToast('Enter your OpenRouter API key before compressing memory.', { type: 'warning' });
        return;
    }

    const previousDraft = state.memoryCompressionDraft || {};
    setMemoryDraft({
        ...previousDraft,
        status: 'loading',
        instructions: getInstructionValue(),
        error: ''
    });
    renderMemoryPanel();

    try {
        const generatedText = (await generateMemorySummary(getInstructionValue())).trim();
        setMemoryDraft({
            status: 'review',
            generatedText,
            instructions: getInstructionValue(),
            createdAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Memory compression failed:', error);
        setMemoryDraft({
            status: 'error',
            generatedText: '',
            instructions: getInstructionValue(),
            error: error.message
        });
    }

    renderMemoryPanel();
}

export function increaseCurrentChatLimit(amount = 20) {
    const increment = normalizeContextMessageCount(amount, 20);
    const nextLimit = setCurrentChatContextLimit(getCurrentChatContextLimit() + increment);
    setMemoryDraft(null);
    saveToLocalStorage();
    renderMessages();
    renderMemoryPanel();
    showToast(`Context limit increased to ${nextLimit} messages.`, { type: 'success' });
}

function getMemorySnapshotListMarkup() {
    const snapshots = getCurrentMemorySnapshots();
    if (snapshots.length === 0) {
        return '<p class="chat-memory-empty">No accepted memory snapshots yet.</p>';
    }

    return `
        <div class="chat-memory-snapshots">
            ${snapshots
                .map(
                    (snapshot, index) => `
                <details class="chat-memory-snapshot">
                    <summary>Memory ${index + 1} · messages ${snapshot.sourceMessageStartIndex}-${snapshot.sourceMessageEndIndex}</summary>
                    <p>${escapeHtml(snapshot.finalText)}</p>
                </details>
            `
                )
                .join('')}
        </div>
    `;
}

function getDecisionMarkup(pressure) {
    return `
        <div class="chat-memory-panel is-blocking">
            <div>
                <p class="chat-memory-kicker">Memory review required</p>
                <h3>Messaging is paused at ${pressure.activeCount}/${pressure.threshold} active messages.</h3>
                <p>The oldest full block of ${pressure.limit} messages must be compressed into reviewed memory, or the context limit must be increased.</p>
            </div>
            <div class="chat-memory-actions">
                <button type="button" class="btn-primary" data-memory-action="compress">Compress memory</button>
                <button type="button" class="btn-secondary" data-memory-action="increase" data-increment="20">Increase +20</button>
                <button type="button" class="btn-secondary" data-memory-action="increase" data-increment="40">+40</button>
                <button type="button" class="btn-secondary" data-memory-action="increase" data-increment="60">+60</button>
            </div>
        </div>
    `;
}

function getReviewMarkup(draft) {
    const isLoading = draft?.status === 'loading';
    const isError = draft?.status === 'error';
    const generatedText = draft?.generatedText || '';

    return `
        <div class="chat-memory-panel is-reviewing">
            <div>
                <p class="chat-memory-kicker">Review memory snapshot</p>
                <h3>${isLoading ? 'Generating summary...' : 'Edit or accept the generated memory.'}</h3>
                <p>Manual edits are saved exactly as written. One-time suggestions only affect the current regeneration.</p>
            </div>
            ${isError ? `<p class="chat-memory-error">${escapeHtml(draft.error || 'Failed to generate memory.')}</p>` : ''}
            <label class="chat-memory-field">
                <span>Generated summary preview</span>
                <textarea id="memoryReviewText" ${isLoading ? 'disabled' : ''}>${escapeHtml(generatedText)}</textarea>
            </label>
            <label class="chat-memory-field">
                <span>One-time suggestions</span>
                <input id="memoryInstructions" type="text" value="${escapeHtml(draft?.instructions || '')}" placeholder="Optional guidance for regeneration">
            </label>
            <div class="chat-memory-actions">
                <button type="button" class="btn-primary" data-memory-action="accept" ${isLoading ? 'disabled' : ''}>Accept</button>
                <button type="button" class="btn-secondary" data-memory-action="regenerate" ${isLoading ? 'disabled' : ''}>Regenerate</button>
                <button type="button" class="btn-secondary" data-memory-action="reject" ${isLoading ? 'disabled' : ''}>Reject</button>
                <button type="button" class="btn-secondary" data-memory-action="increase" data-increment="20">Increase +20</button>
            </div>
        </div>
    `;
}

export function updateMemoryBlockingControls() {
    const pressure = getMemoryPressureState();
    const blocked = pressure.isBlocked;
    if (elements.messageInput) {
        elements.messageInput.disabled = blocked || state.isGenerating;
        elements.messageInput.placeholder = blocked
            ? 'Memory review required before continuing'
            : 'Write your message... (Enter to send, Shift+Enter for new line)';
    }
    if (elements.sendBtn) {
        elements.sendBtn.disabled = blocked || state.isGenerating;
        elements.sendBtn.classList.toggle('opacity-60', blocked || state.isGenerating);
        elements.sendBtn.classList.toggle('cursor-not-allowed', blocked || state.isGenerating);
    }
}

export function renderMemoryPanel() {
    if (!elements.memoryPanel) return;

    const pressure = getMemoryPressureState();
    const draft = state.memoryCompressionDraft;
    const summary = `
        <div class="chat-memory-summary">
            <span>${pressure.activeCount}/${pressure.threshold} active raw messages</span>
            <span>${pressure.archivedCount} archived</span>
            <span>${pressure.snapshotCount} memories</span>
            <span>limit ${pressure.limit}</span>
        </div>
    `;

    if (draft?.status) {
        elements.memoryPanel.innerHTML = summary + getReviewMarkup(draft);
    } else if (pressure.isBlocked) {
        elements.memoryPanel.innerHTML = summary + getDecisionMarkup(pressure);
    } else {
        elements.memoryPanel.innerHTML = `
            ${summary}
            <div class="chat-memory-panel">
                <div>
                    <p class="chat-memory-kicker">Chat memory</p>
                    <h3>Accepted snapshots are included with future model calls.</h3>
                </div>
                ${getMemorySnapshotListMarkup()}
            </div>
        `;
    }

    updateMemoryBlockingControls();
}

export function handleMemoryPanelClick(event) {
    const button = event.target.closest('[data-memory-action]');
    if (!button) return;

    const action = button.getAttribute('data-memory-action');
    if (action === 'compress' || action === 'regenerate') {
        startMemoryCompression();
    } else if (action === 'accept') {
        acceptMemorySummary();
    } else if (action === 'reject') {
        rejectMemorySummary();
    } else if (action === 'increase') {
        increaseCurrentChatLimit(Number.parseInt(button.getAttribute('data-increment'), 10) || 20);
    }
}
