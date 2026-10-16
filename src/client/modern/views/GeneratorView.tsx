import {
    ChevronDown,
    Download,
    Film,
    LoaderCircle,
    RefreshCw,
    Save,
    WandSparkles
} from 'lucide-react';
import { useRef, useState } from 'react';
import { fetchProviderModels, sendUtilityRequest } from '../api.js';
import { Button, IconButton } from '../components/ui.js';
import { runMediaGeneration } from '../media-generation.js';
import {
    ASPECT_RATIOS,
    dimensionsForAspectRatio,
    findMediaPreset,
    formatLoras,
    matchingAspectRatio,
    parseLoras
} from '../media-presets.js';
import type { MediaGenerationPreset } from '../types.js';
import type { ModernController } from '../useModernController.js';

const PROMPT_CHIPS = [
    'cinematic lighting',
    'shallow depth of field',
    'editorial portrait',
    'volumetric atmosphere',
    '35mm film grain',
    'dynamic composition'
];

const PROMPT_HELPERS = [
    ['Refine', 'Refine'],
    ['Expand', 'Expand with rich visual detail'],
    ['Variation', 'Create a compelling variation of']
] as const;

export function GeneratorView({ controller }: { controller: ModernController }) {
    const prefs = controller.data.generatorPrefs;
    const [presetName, setPresetName] = useState('');
    // Text being typed into the LoRA field; reformatting it on every keystroke would eat commas.
    const [loraText, setLoraText] = useState<string | null>(null);
    const [models, setModels] = useState<Record<string, string[]>>({});
    const [loadingModels, setLoadingModels] = useState(false);
    const [busy, setBusy] = useState(false);
    const [helping, setHelping] = useState('');
    const mediaPresets = prefs.presets || [];
    const selectedPreset = findMediaPreset(prefs, prefs.selectedPresetId);
    function patchPrefs(patch: Record<string, unknown>) {
        controller.setData((current) => ({
            ...current,
            generatorPrefs: { ...current.generatorPrefs, ...patch }
        }));
    }
    // The prompt fields are read from and written to the saved preferences, so they survive
    // leaving this view and reloading.
    const prompt = prefs.prompt || '';
    const negative = prefs.negativePrompt || '';
    const batch = Math.min(4, Math.max(1, Math.trunc(Number(prefs.batchCount)) || 1));
    const latestPrompt = useRef(prompt);
    latestPrompt.current = prompt;
    const setPrompt = (value: string) => patchPrefs({ prompt: value });
    const setNegative = (value: string) => patchPrefs({ negativePrompt: value });
    const setBatch = (value: number) => patchPrefs({ batchCount: value });
    function patchPreset(patch: Partial<MediaGenerationPreset>) {
        patchPrefs({
            presets: mediaPresets.map((preset) =>
                preset.id === selectedPreset.id ? { ...preset, ...patch } : preset
            )
        });
    }
    async function loadModels() {
        const provider = selectedPreset.provider;
        setLoadingModels(true);
        try {
            const list = await fetchProviderModels(provider, controller.data.settings);
            setModels((current) => ({ ...current, [provider]: list }));
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        } finally {
            setLoadingModels(false);
        }
    }
    async function helper(label: string, action: string) {
        const original = prompt;
        if (!original.trim() || helping) return;
        setHelping(label);
        try {
            const text = await sendUtilityRequest(controller.data.settings, [
                {
                    role: 'system',
                    content: `You are an image prompt editor. ${action} the prompt. Return only the revised prompt.`
                },
                { role: 'user', content: original }
            ]);
            if (latestPrompt.current === original) setPrompt(text);
            else
                controller.notify('The prompt changed while the helper ran; your edits were kept.');
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        } finally {
            setHelping('');
        }
    }
    async function run() {
        if (!prompt.trim()) return;
        setBusy(true);
        try {
            const result = await runMediaGeneration({
                settings: controller.data.settings,
                preset: selectedPreset,
                prompt,
                negativePrompt: negative,
                source: 'manual',
                batchCount: batch,
                onJobChange: (job) =>
                    controller.setGeneratorJobs((current) => [
                        job,
                        ...current.filter((item) => item.id !== job.id)
                    ])
            });
            controller.setGeneratorAssets((current) => [
                ...result.assets,
                ...current.filter(
                    (asset) => !result.assets.some((created) => created.id === asset.id)
                )
            ]);
            controller.recordUsage('generator', {
                model: result.job.providerModel,
                prompt,
                count: result.assets.length
            });
            controller.notify(
                `Generated ${result.assets.length} ${selectedPreset.mediaType}${result.assets.length === 1 ? '' : 's'}.`,
                'success'
            );
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="m-generator">
            <section className="m-generator__form">
                <div className="m-page-hero compact">
                    <div>
                        <span className="m-eyebrow">Media generator</span>
                        <h2>Shape the scene.</h2>
                        <p>Create outside chat with the same providers and settings.</p>
                    </div>
                    <Button
                        variant="primary"
                        onClick={() => void run()}
                        disabled={!prompt.trim() || busy}
                    >
                        {busy ? (
                            <LoaderCircle className="spin" size={18} />
                        ) : (
                            <WandSparkles size={18} />
                        )}{' '}
                        Generate
                    </Button>
                </div>
                <div className="m-generator__controls">
                    <label className="m-field">
                        <span>Provider</span>
                        <select
                            value={selectedPreset.provider}
                            onChange={(event) => {
                                const value = event.target.value as any;
                                patchPreset({ provider: value, providerModel: '' });
                            }}
                        >
                            <option value="swarm">SwarmUI</option>
                            <option value="comfy">ComfyUI</option>
                            <option value="nanogpt">NanoGPT</option>
                            <option value="openrouter">OpenRouter</option>
                        </select>
                    </label>
                    <label className="m-field">
                        <span>Batch size</span>
                        <select
                            value={batch}
                            onChange={(event) => setBatch(Number(event.target.value))}
                        >
                            {[1, 2, 3, 4].map((count) => (
                                <option key={count} value={count}>
                                    {count}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="m-field">
                        <span>Aspect ratio</span>
                        <select
                            value={matchingAspectRatio(selectedPreset.width, selectedPreset.height)}
                            onChange={(event) => {
                                if (event.target.value === 'auto') return;
                                patchPreset(
                                    dimensionsForAspectRatio(
                                        selectedPreset.width,
                                        selectedPreset.height,
                                        event.target.value
                                    )
                                );
                            }}
                        >
                            <option value="auto">Custom</option>
                            {ASPECT_RATIOS.map((ratio) => (
                                <option key={ratio}>{ratio}</option>
                            ))}
                        </select>
                    </label>
                </div>
                <label className="m-field">
                    <span>Prompt</span>
                    <textarea
                        rows={7}
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder="Describe the scene, subject, camera, light, and mood…"
                    />
                </label>
                <div className="m-chip-row">
                    {PROMPT_CHIPS.map((chip) => (
                        <button
                            key={chip}
                            onClick={() => setPrompt(`${prompt}${prompt ? ', ' : ''}${chip}`)}
                        >
                            {chip}
                        </button>
                    ))}
                </div>
                <label className="m-field">
                    <span>Negative prompt</span>
                    <textarea
                        rows={3}
                        value={negative}
                        onChange={(event) => setNegative(event.target.value)}
                        placeholder="Artifacts, unwanted details…"
                    />
                </label>
                <div className="m-generator__helper">
                    <span>Prompt helper</span>
                    {PROMPT_HELPERS.map(([label, action]) => (
                        <Button
                            key={label}
                            disabled={!prompt.trim() || Boolean(helping)}
                            onClick={() => void helper(label, action)}
                        >
                            {helping === label && <LoaderCircle className="spin" size={15} />}
                            {label}
                        </Button>
                    ))}
                </div>
                <details className="m-advanced" open>
                    <summary>
                        Advanced generation controls <ChevronDown size={17} />
                    </summary>
                    <div className="m-form-grid four">
                        <label className="m-field">
                            <span>Width</span>
                            <input
                                type="number"
                                value={selectedPreset.width}
                                onChange={(event) =>
                                    patchPreset({ width: Number(event.target.value) })
                                }
                            />
                        </label>
                        <label className="m-field">
                            <span>Height</span>
                            <input
                                type="number"
                                value={selectedPreset.height}
                                onChange={(event) =>
                                    patchPreset({ height: Number(event.target.value) })
                                }
                            />
                        </label>
                        <label className="m-field">
                            <span>Steps</span>
                            <input
                                type="number"
                                value={selectedPreset.steps}
                                onChange={(event) =>
                                    patchPreset({ steps: Number(event.target.value) })
                                }
                            />
                        </label>
                        <label className="m-field">
                            <span>CFG</span>
                            <input
                                type="number"
                                step="0.5"
                                value={selectedPreset.cfgScale}
                                onChange={(event) =>
                                    patchPreset({ cfgScale: Number(event.target.value) })
                                }
                            />
                        </label>
                        <label className="m-field">
                            <span>Sampler</span>
                            <select
                                value={selectedPreset.sampler}
                                onChange={(event) => patchPreset({ sampler: event.target.value })}
                            >
                                <option value="euler_ancestral">Euler ancestral</option>
                                <option value="euler">Euler</option>
                                <option value="dpmpp_2m">DPM++ 2M</option>
                                <option value="dpmpp_2m_sde">DPM++ 2M SDE</option>
                            </select>
                        </label>
                        <label className="m-field">
                            <span>Scheduler</span>
                            <select
                                value={selectedPreset.scheduler}
                                onChange={(event) => patchPreset({ scheduler: event.target.value })}
                            >
                                <option value="karras">Karras</option>
                                <option value="normal">Normal</option>
                                <option value="sgm_uniform">SGM Uniform</option>
                            </select>
                        </label>
                        <label className="m-field">
                            <span>Seed mode</span>
                            <select
                                value={selectedPreset.seedMode}
                                onChange={(event) =>
                                    patchPreset({ seedMode: event.target.value as any })
                                }
                            >
                                <option value="random">Random</option>
                                <option value="fixed">Fixed</option>
                                <option value="increment">Increment</option>
                            </select>
                        </label>
                        <label className="m-field">
                            <span>Base seed</span>
                            <input
                                type="number"
                                value={selectedPreset.baseSeed}
                                onChange={(event) =>
                                    patchPreset({ baseSeed: Number(event.target.value) })
                                }
                            />
                        </label>
                        <label className="m-field">
                            <span>Provider model</span>
                            <input
                                list="generator-provider-models"
                                value={selectedPreset.providerModel}
                                onChange={(event) =>
                                    patchPreset({ providerModel: event.target.value })
                                }
                                placeholder="Choose or enter a model"
                            />
                        </label>
                        <datalist id="generator-provider-models">
                            {(models[selectedPreset.provider] || []).map((model) => (
                                <option key={model} value={model} />
                            ))}
                        </datalist>
                        <Button onClick={() => void loadModels()} disabled={loadingModels}>
                            {loadingModels ? (
                                <LoaderCircle className="spin" size={16} />
                            ) : (
                                <RefreshCw size={16} />
                            )}{' '}
                            Load models
                        </Button>
                        <label className="m-field">
                            <span>LoRAs</span>
                            <input
                                value={loraText ?? formatLoras(selectedPreset.loras)}
                                onChange={(event) => {
                                    setLoraText(event.target.value);
                                    patchPreset({ loras: parseLoras(event.target.value) });
                                }}
                                onBlur={() => setLoraText(null)}
                                placeholder="portrait-style:0.8, detail:1"
                            />
                            <small>Applied by SwarmUI and ComfyUI.</small>
                        </label>
                    </div>
                </details>
                <section className="m-preset-row">
                    <select
                        aria-label="Generation preset"
                        value={selectedPreset.id}
                        onChange={(event) => patchPrefs({ selectedPresetId: event.target.value })}
                    >
                        {mediaPresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                                {preset.name}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label="Default chat generation preset"
                        value={prefs.defaultChatPresetId}
                        onChange={(event) =>
                            patchPrefs({ defaultChatPresetId: event.target.value })
                        }
                    >
                        {mediaPresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                                Chat: {preset.name}
                            </option>
                        ))}
                    </select>
                    <input
                        placeholder="Preset name"
                        value={presetName}
                        onChange={(event) => setPresetName(event.target.value)}
                    />
                    <Button
                        onClick={() => {
                            if (!presetName.trim()) return;
                            const newPreset = {
                                ...selectedPreset,
                                id: crypto.randomUUID(),
                                name: presetName.trim()
                            };
                            patchPrefs({
                                presets: [...mediaPresets, newPreset],
                                selectedPresetId: newPreset.id
                            });
                            setPresetName('');
                            controller.notify('Preset saved.', 'success');
                        }}
                    >
                        <Save size={16} /> Save preset
                    </Button>
                </section>
            </section>
            <aside className="m-generator__history">
                <header>
                    <div>
                        <span className="m-eyebrow">Recent output</span>
                        <h3>Queue & results</h3>
                    </div>
                    <IconButton
                        label="Refresh history"
                        onClick={() => void controller.refreshGenerator()}
                    >
                        <RefreshCw size={18} />
                    </IconButton>
                </header>
                <div className="m-result-grid">
                    {controller.generatorAssets.map((asset) => (
                        <article key={asset.id}>
                            {asset.mediaType === 'video' ? (
                                <video src={asset.url} controls preload="metadata" />
                            ) : (
                                <img
                                    src={asset.thumbnailUrl || asset.url}
                                    alt="Generated result"
                                    loading="lazy"
                                />
                            )}
                            <div>
                                <span>
                                    {asset.width && asset.height
                                        ? `${asset.width} × ${asset.height}`
                                        : `Generated ${asset.mediaType}`}
                                </span>
                                <a href={asset.url} target="_blank" rel="noreferrer">
                                    <Download size={15} />
                                </a>
                            </div>
                        </article>
                    ))}
                </div>
                {controller.generatorAssets.length === 0 && (
                    <div className="m-empty-panel">
                        <Film size={28} />
                        <p>Your generated images will appear here.</p>
                    </div>
                )}
                <div className="m-job-list">
                    {controller.generatorJobs.slice(0, 10).map((job) => (
                        <article key={job.id}>
                            <i className={`status-${job.status}`} />
                            <span>
                                <strong>{job.prompt}</strong>
                                <small>
                                    {job.source} · {job.provider} · {job.status}
                                </small>
                            </span>
                        </article>
                    ))}
                </div>
            </aside>
        </div>
    );
}
