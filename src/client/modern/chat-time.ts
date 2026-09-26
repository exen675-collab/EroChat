const DAY = 24 * 60 * 60 * 1000;

function parse(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Clock time for a single message, e.g. "21:04". */
export function formatMessageTime(value?: string): string {
    const date = parse(value);
    return date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

/** Compact timestamp for the conversation list: time today, then weekday, then date. */
export function formatConversationTime(value?: string, now = new Date()): string {
    const date = parse(value);
    if (!date) return '';
    const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
    if (days <= 0) return formatMessageTime(value);
    if (days === 1) return 'Yesterday';
    if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Day divider label for the message stream. */
export function formatDayLabel(value?: string, now = new Date()): string {
    const date = parse(value);
    if (!date) return '';
    const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return date.toLocaleDateString([], {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
    });
}

export function dayKey(value?: string): string {
    const date = parse(value);
    return date ? String(startOfDay(date)) : '';
}
