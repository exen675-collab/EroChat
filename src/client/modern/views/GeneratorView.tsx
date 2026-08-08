import {
    ChevronDown,
    Download,
    Film,
    Image as ImageIcon,
    LoaderCircle,
    RefreshCw,
    Save,
    Upload,
    WandSparkles,
    X
} from 'lucide-react';
import { useRef, useState } from 'react';
import {
    createGeneratorJob,
    generateImages,
    saveGeneratedJobAssets,
    sendUtilityRequest,
    updateGeneratorJob
} from '../api.js';
import { Button, IconButton } from '../components/ui.js';
import type { ModernSettings } from '../types.js';
import type { ModernController } from '../useModernController.js';

const PROMPT_CHIPS = [
    'cinematic lighting',
    'shallow depth of field',
    'editorial portrait',
    'volumetric atmosphere',
    '35mm film grain',
    'dynamic composition'
];

export function GeneratorView({ controller }: { controller: ModernController }) {
    const prefs = controller.data.generatorPrefs;
    const [prompt, setPrompt] = useState(prefs.prompt || '');
    const [negative, setNegative] = useState(prefs.negativePrompt || '');
    const [provider, setProvider] = useState(prefs.provider || 'swarm');
    const [batch, setBatch] = useState(Number(prefs.batchCount) || 1);
    const [sources, setSources] = useState<string[]>([]);
    const [presetName, setPresetName] = useState('');
    const [selectedPreset, setSelectedPreset] = useState('');
    const [busy, setBusy] = useState(false);
    const uploadRef = useRef<HTMLInputElement>(null);
    function patchPrefs(patch: Record<string, unknown>) {
        controller.setData((current) => ({
            ...current,
            generatorPrefs: { ...current.generatorPrefs, ...patch }
        }));
    }
    async function helper(action: string) {
        try {
            const text = await sendUtilityRequest(controller.data.settings, [
                {
                    role: 'system',
                    content: `You are an image prompt editor. ${action} the prompt. Return only the revised prompt.`
                },
                { role: 'user', content: prompt }
            ]);
            setPrompt(text);
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        }
    }
    async function run() {
        if (!prompt.trim()) return;
        setBusy(true);
        const settings = { ...controller.data.settings, imageProvider: provider } as ModernSettings;
        const request = {
            batchCount: batch,
            width: Number(prefs.swarmWidth),
            height: Number(prefs.swarmHeight),
            steps: Number(prefs.swarmSteps),
            cfgScale: Number(prefs.swarmCfgScale),
            sampler: String(prefs.swarmSampler),
            scheduler: String(prefs.swarmScheduler),
            seedMode: String(prefs.swarmSeedMode),
            baseSeed: Number(prefs.swarmBaseSeed)
        };
        try {
            const jobs = await createGeneratorJob({
                batchId: crypto.randomUUID(),
                mode: 'image_generate',
                provider,
                prompt,
                negativePrompt: negative,
                providerModel:
                    provider === 'swarm'
                        ? settings.swarmModel
                        : provider === 'comfy'
                          ? settings.comfyModel
                          : provider === 'nanogpt'
                            ? settings.nanogptModel
                            : settings.openrouterImageModel,
                sourceAssetIds: [],
                requestJson: request
            });
            const job = jobs[0];
            controller.setGeneratorJobs((current) => [job, ...current]);
            await updateGeneratorJob(job.id, { status: 'running' });
            const results = await generateImages(settings, {
                prompt,
                negativePrompt: negative,
                ...request
            });
            await saveGeneratedJobAssets(job, results, request);
            await controller.refreshGenerator();
            controller.recordUsage('generator', {
                model: job.providerModel,
                prompt,
                count: results.length
            });
            controller.notify(
                `Generated ${results.length} image${results.length === 1 ? '' : 's'}.`,
                'success'
            );
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        } finally {
            setBusy(false);
        }
    }
    const presets = prefs.promptPresets || [];
    return (
        <div className="m-generator">
            <section className="m-generator__form">
                <div className="m-page-hero compact">
                    <div>
                        <span className="m-eyebrow">Image generator</span>
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
                        <span>Mode</span>
                        <select>
                            <option>Create image</option>
                        </select>
                    </label>
                    <label className="m-field">
                        <span>Provider</span>
                        <select
                            value={provider}
                            onChange={(event) => {
                                const value = event.target.value as any;
                                setProvider(value);
                                patchPrefs({ provider: value });
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
                        <input
                            type="number"
                            min={1}
                            max={4}
                            value={batch}
                            onChange={(event) => setBatch(Number(event.target.value))}
                        />
                    </label>
                    <label className="m-field">
                        <span>Aspect ratio</span>
                        <select
                            value={String(prefs.aspectRatio)}
                            onChange={(event) => patchPrefs({ aspectRatio: event.target.value })}
                        >
                            <option value="auto">Custom</option>
                            <option>1:1</option>
                            <option>16:9</option>
                            <option>9:16</option>
                            <option>4:3</option>
                            <option>3:4</option>
                        </select>
                    </label>
                </div>
                <label className="m-field">
                    <span>Prompt</span>
                    <textarea
                        rows={7}
                        value={prompt}
                        onChange={(event) => {
                            setPrompt(event.target.value);
                            patchPrefs({ prompt: event.target.value });
                        }}
                        placeholder="Describe the scene, subject, camera, light, and mood…"
                    />
                </label>
                <div className="m-chip-row">
                    {PROMPT_CHIPS.map((chip) => (
                        <button
                            key={chip}
                            onClick={() =>
                                setPrompt((current) => `${current}${current ? ', ' : ''}${chip}`)
                            }
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
                    <Button onClick={() => void helper('Refine')}>Refine</Button>
                    <Button onClick={() => void helper('Expand with rich visual detail')}>
                        Expand
                    </Button>
                    <Button onClick={() => void helper('Create a compelling variation of')}>
                        Variation
                    </Button>
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
                                value={Number(prefs.swarmWidth)}
                                onChange={(event) =>
                                    patchPrefs({ swarmWidth: Number(event.target.value) })
                                }
                            />
                        </label>
                        <label className="m-field">
                            <span>Height</span>
                            <input
                                type="number"
                                value={Number(prefs.swarmHeight)}
                                onChange={(event) =>
                                    patchPrefs({ swarmHeight: Number(event.target.value) })
                                }
                            />
                        </label>
                        <label className="m-field">
                            <span>Steps</span>
                            <input
                                type="number"
                                value={Number(prefs.swarmSteps)}
                                onChange={(event) =>
                                    patchPrefs({ swarmSteps: Number(event.target.value) })
                                }
                            />
                        </label>
                        <label className="m-field">
                            <span>CFG</span>
                            <input
                                type="number"
                                step="0.5"
                                value={Number(prefs.swarmCfgScale)}
                                onChange={(event) =>
                                    patchPrefs({ swarmCfgScale: Number(event.target.value) })
                                }
                            />
                        </label>
                        <label className="m-field">
                            <span>Sampler</span>
                            <select
                                value={String(prefs.swarmSampler)}
                                onChange={(event) =>
                                    patchPrefs({ swarmSampler: event.target.value })
                                }
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
                                value={String(prefs.swarmScheduler)}
                                onChange={(event) =>
                                    patchPrefs({ swarmScheduler: event.target.value })
                                }
                            >
                                <option value="karras">Karras</option>
                                <option value="normal">Normal</option>
                                <option value="sgm_uniform">SGM Uniform</option>
                            </select>
                        </label>
                        <label className="m-field">
                            <span>Seed mode</span>
                            <select
                                value={String(prefs.swarmSeedMode)}
                                onChange={(event) =>
                                    patchPrefs({ swarmSeedMode: event.target.value })
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
                                value={Number(prefs.swarmBaseSeed)}
                                onChange={(event) =>
                                    patchPrefs({ swarmBaseSeed: Number(event.target.value) })
                                }
                            />
                        </label>
                    </div>
                </details>
                <section className="m-generator__sources">
                    <header>
                        <div>
                            <span className="m-eyebrow">Source images</span>
                            <p>Upload or reuse media for future edit-capable modes.</p>
                        </div>
                        <input
                            ref={uploadRef}
                            hidden
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={async (event) => {
                                const files = Array.from(event.target.files || []);
                                const urls = files.map((file) => URL.createObjectURL(file));
                                setSources((current) => [...current, ...urls]);
                            }}
                        />
                        <Button onClick={() => uploadRef.current?.click()}>
                            <Upload size={17} /> Upload
                        </Button>
                    </header>
                    {sources.length ? (
                        <div className="m-source-row">
                            {sources.map((source) => (
                                <button
                                    key={source}
                                    onClick={() =>
                                        setSources((current) =>
                                            current.filter((item) => item !== source)
                                        )
                                    }
                                >
                                    <img src={source} alt="Source" />
                                    <X size={16} />
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="m-empty-inline">
                            <ImageIcon size={22} /> No source images selected
                        </div>
                    )}
                </section>
                <section className="m-preset-row">
                    <select
                        value={selectedPreset}
                        onChange={(event) => {
                            setSelectedPreset(event.target.value);
                            const preset = presets.find((item) => item.name === event.target.value);
                            if (preset) {
                                setPrompt(preset.prompt);
                                setNegative(preset.negativePrompt || '');
                            }
                        }}
                    >
                        <option value="">Load a prompt preset…</option>
                        {presets.map((preset) => (
                            <option key={preset.name}>{preset.name}</option>
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
                            patchPrefs({
                                promptPresets: [
                                    ...presets.filter((item) => item.name !== presetName),
                                    { name: presetName, prompt, negativePrompt: negative }
                                ]
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
                            <img
                                src={asset.thumbnailUrl || asset.url}
                                alt="Generated result"
                                loading="lazy"
                            />
                            <div>
                                <span>
                                    {asset.width && asset.height
                                        ? `${asset.width} × ${asset.height}`
                                        : 'Generated image'}
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
                                    {job.provider} · {job.status}
                                </small>
                            </span>
                        </article>
                    ))}
                </div>
            </aside>
        </div>
    );
}
