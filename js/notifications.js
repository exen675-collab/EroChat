const TOAST_VIEWPORT_ID = 'appToastViewport';
const TOAST_TONE_CLASSES = {
    info: 'border-slate-700/70 bg-slate-900/95 text-slate-100',
    success: 'border-emerald-700/60 bg-emerald-950/90 text-emerald-100',
    warning: 'border-amber-700/60 bg-amber-950/90 text-amber-100',
    error: 'border-red-700/60 bg-red-950/90 text-red-100'
};

function normalizeMessage(message) {
    return String(message ?? '').trim();
}

function ensureToastViewport() {
    let viewport = document.getElementById(TOAST_VIEWPORT_ID);
    if (viewport) {
        return viewport;
    }

    viewport = document.createElement('div');
    viewport.id = TOAST_VIEWPORT_ID;
    viewport.className =
        'fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-3 px-4 pointer-events-none';
    viewport.setAttribute('aria-live', 'polite');
    viewport.setAttribute('aria-atomic', 'false');
    document.body.appendChild(viewport);
    return viewport;
}

function createActionButton(action, type) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.className =
        action.variant === 'secondary'
            ? 'px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-slate-200 hover:bg-white/5 transition-colors'
            : `px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  type === 'error'
                      ? 'bg-red-500/20 text-red-100 hover:bg-red-500/30'
                      : type === 'warning'
                        ? 'bg-amber-500/20 text-amber-100 hover:bg-amber-500/30'
                        : 'bg-pink-500/20 text-pink-100 hover:bg-pink-500/30'
              }`;
    return button;
}

export function showToast(message, options = {}) {
    const text = normalizeMessage(message);
    if (!text) {
        return { close: () => {} };
    }

    const {
        type = 'info',
        duration = 5000,
        persistent = false,
        actionLabel,
        onAction,
        onClose
    } = options;
    const actions = [...(Array.isArray(options.actions) ? options.actions : [])];

    if (actionLabel && typeof onAction === 'function') {
        actions.push({ label: actionLabel, onClick: onAction });
    }

    const viewport = ensureToastViewport();
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto w-full max-w-md rounded-2xl border shadow-2xl backdrop-blur px-4 py-3 ${TOAST_TONE_CLASSES[type] || TOAST_TONE_CLASSES.info}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const header = document.createElement('div');
    header.className = 'flex items-start gap-3';

    const body = document.createElement('div');
    body.className = 'flex-1 min-w-0';

    const textNode = document.createElement('p');
    textNode.className = 'text-sm leading-5 whitespace-pre-line';
    textNode.textContent = text;
    body.appendChild(textNode);

    if (actions.length > 0) {
        const actionsRow = document.createElement('div');
        actionsRow.className = 'mt-3 flex flex-wrap gap-2';

        actions.forEach((action) => {
            if (!action?.label || typeof action.onClick !== 'function') {
                return;
            }

            const button = createActionButton(action, type);
            button.addEventListener('click', () => {
                action.onClick();
                close();
            });
            actionsRow.appendChild(button);
        });

        if (actionsRow.childElementCount > 0) {
            body.appendChild(actionsRow);
        }
    }

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className =
        'flex-shrink-0 rounded-lg p-1 text-current/70 hover:bg-white/10 hover:text-current transition-colors';
    dismissBtn.setAttribute('aria-label', 'Dismiss notification');
    dismissBtn.textContent = '×';

    header.appendChild(body);
    header.appendChild(dismissBtn);
    toast.appendChild(header);
    viewport.appendChild(toast);

    let isClosed = false;
    let timeoutId = null;

    function close() {
        if (isClosed) {
            return;
        }

        isClosed = true;
        if (timeoutId) {
            window.clearTimeout(timeoutId);
        }
        toast.remove();
        onClose?.();
    }

    dismissBtn.addEventListener('click', close);

    if (!persistent && duration > 0) {
        timeoutId = window.setTimeout(close, duration);
    }

    return { close, element: toast };
}

export function requestConfirmation(message, options = {}) {
    const text = normalizeMessage(message);
    if (!text) {
        return Promise.resolve(false);
    }

    const { confirmLabel = 'Confirm', cancelLabel = 'Cancel', type = 'warning' } = options;

    return new Promise((resolve) => {
        let settled = false;

        const settle = (value) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(value);
        };

        showToast(text, {
            type,
            persistent: true,
            actions: [
                {
                    label: cancelLabel,
                    variant: 'secondary',
                    onClick: () => settle(false)
                },
                {
                    label: confirmLabel,
                    onClick: () => settle(true)
                }
            ],
            onClose: () => settle(false)
        });
    });
}

export function installAlertNotificationOverrides() {
    if (window.__erochatNotificationsInstalled) {
        return;
    }

    const originalAlert = window.alert?.bind(window);
    window.__erochatNotificationsInstalled = true;
    window.__erochatOriginalAlert = originalAlert;

    window.alert = (message) => {
        showToast(message, {
            type: 'info'
        });
    };
}
