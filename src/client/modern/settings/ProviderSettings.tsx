import type { ModernSettings } from '../types.js';

export function ProviderSettings({
    provider,
    settings,
    update
}: {
    provider: 'swarm' | 'comfy' | 'nanogpt' | 'openrouter';
    settings: ModernSettings;
    update: (patch: Partial<ModernSettings>) => void;
}) {
    if (settings.imageProvider !== provider) return null;
    const labels = {
        swarm: 'SwarmUI',
        comfy: 'ComfyUI',
        nanogpt: 'NanoGPT',
        openrouter: 'OpenRouter'
    };
    const urlKey = `${provider}Url` as keyof ModernSettings;
    return (
        <div className="m-provider-box">
            <span className="m-eyebrow">{labels[provider]} connection</span>
            {provider !== 'openrouter' && (
                <label className="m-field">
                    <span>Base URL</span>
                    <input
                        value={String(settings[urlKey] || '')}
                        onChange={(event) => update({ [urlKey]: event.target.value })}
                    />
                </label>
            )}
            {provider === 'openrouter' && (
                <p className="m-muted">Uses the OpenRouter API key configured for text above.</p>
            )}
            {provider === 'nanogpt' && (
                <>
                    <label className="m-field">
                        <span>API key</span>
                        <input
                            type="password"
                            value={settings.nanogptKey}
                            onChange={(event) => update({ nanogptKey: event.target.value })}
                        />
                    </label>
                    <label className="m-field">
                        <span>Quality</span>
                        <select
                            value={settings.nanogptQuality}
                            onChange={(event) => update({ nanogptQuality: event.target.value })}
                        >
                            <option>low</option>
                            <option>medium</option>
                            <option>high</option>
                        </select>
                    </label>
                </>
            )}
        </div>
    );
}
