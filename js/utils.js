import { elements } from './dom.js';

export const SWARM_SAMPLERS = [
    'euler',
    'euler_ancestral',
    'heun',
    'heunpp2',
    'dpm_2',
    'dpm_2_ancestral',
    'lms',
    'dpm_fast',
    'dpm_adaptive',
    'dpmpp_2s_ancestral',
    'dpmpp_sde',
    'dpmpp_sde_gpu',
    'dpmpp_2m',
    'dpmpp_2m_sde',
    'dpmpp_2m_sde_gpu',
    'dpmpp_3m_sde',
    'dpmpp_3m_sde_gpu',
    'ddim',
    'ddpm',
    'lcm',
    'uni_pc',
    'uni_pc_bh2',
    'res_multistep',
    'res_multistep_ancestral',
    'ipndm',
    'ipndm_v',
    'deis',
    'gradient_estimation',
    'er_sde',
    'seeds_2',
    'seeds_3',
    'sa_solver',
    'sa_solver_pece',
    'exp_heun_2_x0',
    'exp_heun_2_x0_sde',
    'dpmpp_2m_sde_heun',
    'dpmpp_2m_sde_heun_gpu',
    'euler_cfg_pp',
    'euler_ancestral_cfg_pp',
    'dpmpp_2m_cfg_pp',
    'dpmpp_2s_ancestral_cfg_pp',
    'res_multistep_cfg_pp',
    'res_multistep_ancestral_cfg_pp',
    'gradient_estimation_cfg_pp'
];

const SWARM_SAMPLER_ALIASES = {
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

// Generate unique ID
export function generateId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Escape HTML to prevent XSS
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format message text:
// - convert *action* segments into highlighted spans
// - keep normal dialog/plain text unchanged
// - convert newlines to <br>
export function formatMessage(text, role = 'ai') {
    const safeText = String(text ?? '');
    const actionClass = role === 'user' ? 'chat-action user-action' : 'chat-action ai-action';
    const withActionLineBreaks = safeText.replace(/\*([^*]+)\*/g, (match, actionText, offset, source) => {
        const afterAction = source.slice(offset + match.length);
        const alreadyEndsLine = /^\s*\n/.test(afterAction);
        return `<span class="${actionClass}">${actionText}</span>${alreadyEndsLine ? '' : '\n'}`;
    });

    return withActionLineBreaks
        .replace(/\n/g, '<br>');
}

// Update connection status indicator
export function updateConnectionStatus(connected) {
    const dot = elements.connectionStatus.querySelector('span:first-child');
    const text = elements.connectionStatus.querySelector('span:last-child');
    
    if (connected) {
        dot.className = 'w-2 h-2 rounded-full bg-green-500';
        text.textContent = 'Connected';
        text.className = 'text-green-400';
    } else {
        dot.className = 'w-2 h-2 rounded-full bg-gray-500';
        text.textContent = 'Disconnected';
        text.className = 'text-gray-400';
    }
}


// Normalize base URL by trimming spaces and trailing slash
export function normalizeBaseUrl(url) {
    return (url || '').trim().replace(/\/$/, '');
}

export function normalizeSwarmSampler(value, fallback = 'euler_ancestral') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();

    return SWARM_SAMPLER_ALIASES[normalized] || fallback;
}

export function syncSwarmSamplerSelect(select, value, fallback = 'euler_ancestral') {
    if (!select) return;

    if (select.options.length !== SWARM_SAMPLERS.length) {
        select.innerHTML = SWARM_SAMPLERS
            .map((sampler) => `<option value="${sampler}">${sampler}</option>`)
            .join('');
    }

    const nextValue = normalizeSwarmSampler(value, fallback);
    select.value = SWARM_SAMPLERS.includes(nextValue) ? nextValue : fallback;
}

export function normalizeImageProvider(value, fallback = 'swarm') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();

    if (normalized === 'local') return 'swarm';
    if (normalized === 'grok') return 'premium';
    if (normalized === 'swarm' || normalized === 'comfy' || normalized === 'premium') {
        return normalized;
    }

    return fallback;
}
