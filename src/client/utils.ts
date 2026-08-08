const SWARM_SAMPLER_ALIASES: Record<string, string> = {
    'euler a': 'euler_ancestral',
    'euler ancestral': 'euler_ancestral',
    euler_ancestral: 'euler_ancestral',
    euler: 'euler',
    'dpm++ 2m karras': 'dpmpp_2m',
    dpmpp_2m: 'dpmpp_2m',
    'dpm++ sde karras': 'dpmpp_sde',
    dpmpp_sde: 'dpmpp_sde',
    ddim: 'ddim',
    unipc: 'uni_pc',
    uni_pc: 'uni_pc'
};

const IMAGE_SCHEDULER_ALIASES: Record<string, string> = {
    none: '',
    off: '',
    disabled: '',
    no: '',
    karras: 'karras',
    normal: 'normal',
    exponential: 'exponential',
    'sgm uniform': 'sgm_uniform',
    sgm_uniform: 'sgm_uniform',
    simple: 'simple',
    'ddim uniform': 'ddim_uniform',
    ddim_uniform: 'ddim_uniform',
    beta: 'beta',
    'linear quadratic': 'linear_quadratic',
    linear_quadratic: 'linear_quadratic',
    'kl optimal': 'kl_optimal',
    kl_optimal: 'kl_optimal'
};

const IMAGE_PROMPT_BLOCK_PATTERN =
    /(?:---IMAGE_PROMPT START---[\s\S]*?---IMAGE_PROMPT END---|<image_prompt>[\s\S]*?<\/image_prompt>)/gi;
const ACTION_SEGMENT_PATTERN = /\*([^*]+)\*/g;

export function normalizeBaseUrl(value: unknown): string {
    return String(value || '')
        .trim()
        .replace(/\/$/, '');
}

export function normalizeSwarmSampler(value: unknown, fallback = 'euler_ancestral'): string {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();

    return SWARM_SAMPLER_ALIASES[normalized] || fallback;
}

export function normalizeImageScheduler(value: unknown, fallback = 'karras'): string {
    const normalized = String(value ?? '')
        .trim()
        .toLowerCase();

    if (normalized === '') return '';

    return Object.prototype.hasOwnProperty.call(IMAGE_SCHEDULER_ALIASES, normalized)
        ? IMAGE_SCHEDULER_ALIASES[normalized]
        : fallback;
}

export function stripImagePromptBlocks(value: unknown): string {
    return String(value ?? '').replace(IMAGE_PROMPT_BLOCK_PATTERN, '');
}

interface AssistantTextOptions {
    preserveActionMarkers?: boolean;
    normalizeWhitespace?: boolean;
}

export function getAssistantVisibleText(
    value: unknown,
    options: AssistantTextOptions = {}
): string {
    const { preserveActionMarkers = true, normalizeWhitespace = false } = options;
    let normalized = stripImagePromptBlocks(value).replace(/\r\n?/g, '\n');

    if (!preserveActionMarkers) {
        normalized = normalized.replace(ACTION_SEGMENT_PATTERN, '$1');
    }

    if (normalizeWhitespace) {
        normalized = normalized
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]{2,}/g, ' ');
    }

    return normalized.trim();
}

export function getAssistantReadableText(value: unknown): string {
    return getAssistantVisibleText(value, {
        preserveActionMarkers: false,
        normalizeWhitespace: true
    });
}

interface ContextMessage {
    archivedFromModelContext?: boolean;
}

export function getActiveRawMessages<T extends ContextMessage>(
    messages: readonly T[] | null | undefined
): T[] {
    return Array.isArray(messages)
        ? messages.filter((message) => message?.archivedFromModelContext !== true)
        : [];
}
