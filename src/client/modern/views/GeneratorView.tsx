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
import { sendUtilityRequest } from '../api.js';
import { Button, IconButton } from '../components/ui.js';
import { runMediaGeneration } from '../media-generation.js';
import { findMediaPreset } from '../media-presets.js';
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

export function GeneratorView({ controller }: { controller: ModernController }) {
    const prefs = controller.data.generatorPrefs;
    const [prompt, setPrompt] = useState(prefs.prompt || '');
    const [negative, setNegative] = useState(prefs.negativePrompt || '');
    const [batch, setBatch] = useState(Number(prefs.batchCount) || 1);
    const [sources, setSources] = useState<string[]>([]);
    const [presetName, setPresetName] = useState('');
    const [busy, setBusy] = useState(false);
    const uploadRef = useRef<HTMLInputElement>(null);
    const mediaPresets = prefs.presets || [];
    const selectedPreset = findMediaPreset(prefs, prefs.selectedPresetId);
    function patchPrefs(patch: Record<string, unknown>) {
        controller.setData((current) => ({
            ...current,
            generatorPrefs: { ...current.generatorPrefs, ...patch }
        }));
    }
    function patchPreset(patch: Partial<MediaGenerationPreset>) {
        patchPrefs({
            presets: mediaPresets.map((preset) =>
                preset.id === selectedPreset.id ? { ...preset, ...patch } : preset
            )
        });
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
                        <span>Mode</span>
                        <select
                            value={selectedPreset.mediaType}
                            onChange={(event) =>
                                patchPreset({ mediaType: event.target.value as 'image' | 'video' })
                            }
                        >
                            <option value="image">Create image</option>
                            <option value="video">Create video</option>
                        </select>
                    </label>
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
                                value={selectedPreset.providerModel}
                                onChange={(event) =>
                                    patchPreset({ providerModel: event.target.value })
                                }
                                placeholder="Use provider setting"
                            />
                        </label>
                        <label className="m-field">
                            <span>Workflow</span>
                            <input
                                value={selectedPreset.workflow || ''}
                                onChange={(event) => patchPreset({ workflow: event.target.value })}
                                placeholder="Optional workflow name"
                            />
                        </label>
                        <label className="m-field">
                            <span>LoRAs</span>
                            <input
                                value={selectedPreset.loras
                                    .map((lora) => `${lora.name}:${lora.weight}`)
                                    .join(', ')}
                                onChange={(event) =>
                                    patchPreset({
                                        loras: event.target.value
                                            .split(',')
                                            .map((item) => item.trim())
                                            .filter(Boolean)
                                            .map((item) => {
                                                const separator = item.lastIndexOf(':');
                                                const weight = Number(item.slice(separator + 1));
                                                return {
                                                    name:
                                                        separator > 0
                                                            ? item.slice(0, separator).trim()
                                                            : item,
                                                    weight:
                                                        separator > 0 && Number.isFinite(weight)
                                                            ? weight
                                                            : 1
                                                };
                                            })
                                    })
                                }
                                placeholder="portrait-style:0.8, detail:1"
                            />
                        </label>
                        <label className="m-field">
                            <span>Execution backend</span>
                            <select
                                value={selectedPreset.executionBackend}
                                onChange={(event) =>
                                    patchPreset({ executionBackend: event.target.value as any })
                                }
                            >
                                <option value="local">Local / provider API</option>
                                <option value="runpod">RunPod Serverless</option>
                            </select>
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
