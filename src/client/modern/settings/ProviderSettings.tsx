import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/ui.js';
import type { ModernSettings } from '../types.js';

export function ProviderSettings({
    provider,
    settings,
    update,
    onLoad,
    loading,
    models
}: {
    provider: 'swarm' | 'comfy' | 'nanogpt' | 'openrouter';
    settings: ModernSettings;
    update: (patch: Partial<ModernSettings>) => void;
    onLoad: () => void;
    loading: boolean;
    models: string[];
}) {
    const [modelSearch, setModelSearch] = useState('');
    if (settings.imageProvider !== provider) return null;
    const labels = {
        swarm: 'SwarmUI',
        comfy: 'ComfyUI',
        nanogpt: 'NanoGPT',
        openrouter: 'OpenRouter'
    };
    const urlKey = `${provider}Url` as keyof ModernSettings;
    const modelKey = (
        provider === 'openrouter' ? 'openrouterImageModel' : `${provider}Model`
    ) as keyof ModernSettings;
    const selectedModel = String(settings[modelKey] || '');
    const filteredModels = models
        .filter((model) => model.toLowerCase().includes(modelSearch.toLowerCase()))
        .slice(0, 300);
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
            <div className="m-field">
                <span>Model</span>
                <div className="m-inline">
                    <input
                        placeholder="Search loaded models"
                        value={modelSearch}
                        onChange={(event) => setModelSearch(event.target.value)}
                    />
                    <Button onClick={onLoad} disabled={loading}>
                        {loading ? (
                            <LoaderCircle className="spin" size={16} />
                        ) : (
                            <RefreshCw size={16} />
                        )}{' '}
                        Load models
                    </Button>
                </div>
                <select
                    size={Math.min(8, Math.max(2, filteredModels.length))}
                    value={selectedModel}
                    onChange={(event) => update({ [modelKey]: event.target.value })}
                >
                    <option value={selectedModel}>{selectedModel || 'Select a model'}</option>
                    {filteredModels
                        .filter((model) => model !== selectedModel)
                        .map((model) => (
                            <option key={model}>{model}</option>
                        ))}
                </select>
            </div>
        </div>
    );
}
