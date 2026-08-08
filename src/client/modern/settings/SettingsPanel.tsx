import {
    Bot,
    CircleUserRound,
    Heart,
    LoaderCircle,
    LogOut,
    RefreshCw,
    Save,
    Trash2,
    UserRoundCog,
    Users,
    WandSparkles,
    X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    fetchAdminUsers,
    fetchOpenRouterModels,
    fetchProviderModels,
    logout,
    updateAdminCredits,
    updateProfile
} from '../api.js';
import { Button, IconButton } from '../components/ui.js';
import type { ImageProvider, ModernSettings } from '../types.js';
import type { ModernController } from '../useModernController.js';
import { ProviderSettings } from './ProviderSettings.js';
import { SettingsSection } from './SettingsSection.js';

export function SettingsPanel({
    controller,
    onClose
}: {
    controller: ModernController;
    onClose: () => void;
}) {
    const [tab, setTab] = useState<'providers' | 'generation' | 'account' | 'admin'>('providers');
    const [settings, setSettings] = useState<ModernSettings>({ ...controller.data.settings });
    const [textModels, setTextModels] = useState<string[]>([]);
    const [imageModels, setImageModels] = useState<Partial<Record<ImageProvider, string[]>>>({});
    const [modelSearch, setModelSearch] = useState('');
    const [loading, setLoading] = useState('');
    const [profile, setProfile] = useState({
        username: controller.user.username,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [adminUsers, setAdminUsers] = useState<any[]>([]);
    const [credits, setCredits] = useState<Record<number, number>>({});
    const update = (patch: Partial<ModernSettings>) =>
        setSettings((current) => ({ ...current, ...patch }));
    async function loadTextModels() {
        setLoading('openrouter');
        try {
            const list = await fetchOpenRouterModels(settings);
            setTextModels(list);
            controller.notify(`Loaded ${list.length} models.`, 'success');
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        } finally {
            setLoading('');
        }
    }
    async function loadImageModels(provider: ImageProvider) {
        setLoading(`${provider}-images`);
        try {
            const list = await fetchProviderModels(provider, settings);
            setImageModels((current) => ({ ...current, [provider]: list }));
            controller.notify(`Loaded ${list.length} models.`, 'success');
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        } finally {
            setLoading('');
        }
    }
    async function loadUsers() {
        try {
            const users = await fetchAdminUsers();
            setAdminUsers(users);
            setCredits(Object.fromEntries(users.map((user: any) => [user.id, user.credits])));
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        }
    }
    useEffect(() => {
        if (tab === 'admin' && controller.user.isAdmin) void loadUsers();
    }, [tab]);
    function save() {
        controller.updateSettings(settings);
        controller.notify('Settings saved.', 'success');
    }
    const filteredModels = textModels
        .filter((model) => model.toLowerCase().includes(modelSearch.toLowerCase()))
        .slice(0, 300);
    return (
        <div
            className="m-settings-backdrop"
            onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
            <aside className="m-settings" role="dialog" aria-modal="true" aria-label="Settings">
                <header>
                    <div>
                        <span className="m-eyebrow">Workspace</span>
                        <h2>Settings</h2>
                    </div>
                    <IconButton label="Close settings" onClick={onClose}>
                        <X size={20} />
                    </IconButton>
                </header>
                <nav aria-label="Settings sections">
                    <button
                        className={tab === 'providers' ? 'is-active' : ''}
                        onClick={() => setTab('providers')}
                    >
                        <Bot size={18} /> Providers
                    </button>
                    <button
                        className={tab === 'generation' ? 'is-active' : ''}
                        onClick={() => setTab('generation')}
                    >
                        <WandSparkles size={18} /> Generation
                    </button>
                    <button
                        className={tab === 'account' ? 'is-active' : ''}
                        onClick={() => setTab('account')}
                    >
                        <UserRoundCog size={18} /> Account
                    </button>
                    {controller.user.isAdmin && (
                        <button
                            className={tab === 'admin' ? 'is-active' : ''}
                            onClick={() => setTab('admin')}
                        >
                            <Users size={18} /> Admin
                        </button>
                    )}
                </nav>
                <div className="m-settings__body">
                    {tab === 'providers' && (
                        <>
                            <SettingsSection
                                title="Text provider"
                                description="OpenRouter powers chat, prompt helpers, memory, and writing tools."
                            >
                                <label className="m-field">
                                    <span>Provider</span>
                                    <select
                                        value={settings.textProvider}
                                        onChange={(event) =>
                                            update({ textProvider: event.target.value })
                                        }
                                    >
                                        <option value="openrouter">OpenRouter</option>
                                        <option value="premium">Premium</option>
                                    </select>
                                </label>
                                <label className="m-field">
                                    <span>OpenRouter API key</span>
                                    <input
                                        type="password"
                                        value={settings.openrouterKey}
                                        onChange={(event) =>
                                            update({ openrouterKey: event.target.value })
                                        }
                                    />
                                </label>
                                <div className="m-field">
                                    <span>Model</span>
                                    <div className="m-inline">
                                        <input
                                            placeholder="Search loaded models"
                                            value={modelSearch}
                                            onChange={(event) => setModelSearch(event.target.value)}
                                        />
                                        <Button
                                            onClick={() => void loadTextModels()}
                                            disabled={loading === 'openrouter'}
                                        >
                                            {loading === 'openrouter' ? (
                                                <LoaderCircle className="spin" size={16} />
                                            ) : (
                                                <RefreshCw size={16} />
                                            )}{' '}
                                            Load models
                                        </Button>
                                    </div>
                                    <select
                                        size={Math.min(8, Math.max(2, filteredModels.length))}
                                        value={settings.openrouterModel}
                                        onChange={(event) =>
                                            update({ openrouterModel: event.target.value })
                                        }
                                    >
                                        <option value={settings.openrouterModel}>
                                            {settings.openrouterModel || 'Select a model'}
                                        </option>
                                        {filteredModels
                                            .filter((model) => model !== settings.openrouterModel)
                                            .map((model) => (
                                                <option key={model}>{model}</option>
                                            ))}
                                    </select>
                                </div>
                                <label className="m-toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.openrouterReasoningEnabled}
                                        onChange={(event) =>
                                            update({
                                                openrouterReasoningEnabled: event.target.checked
                                            })
                                        }
                                    />
                                    <span>
                                        <strong>Reasoning</strong>
                                        <small>Ask supported models to reason internally.</small>
                                    </span>
                                </label>
                                {settings.openrouterReasoningEnabled && (
                                    <label className="m-field">
                                        <span>Reasoning effort</span>
                                        <select
                                            value={settings.openrouterReasoningEffort}
                                            onChange={(event) =>
                                                update({
                                                    openrouterReasoningEffort: event.target.value
                                                })
                                            }
                                        >
                                            <option>minimal</option>
                                            <option>low</option>
                                            <option>medium</option>
                                            <option>high</option>
                                            <option>xhigh</option>
                                        </select>
                                    </label>
                                )}
                                <div className="m-favorites">
                                    <span>Favorite models</span>
                                    <div>
                                        {settings.favoriteOpenRouterModels.map((model) => (
                                            <button
                                                key={model}
                                                onClick={() =>
                                                    update({
                                                        favoriteOpenRouterModels:
                                                            settings.favoriteOpenRouterModels.filter(
                                                                (item) => item !== model
                                                            )
                                                    })
                                                }
                                            >
                                                {model}
                                                <X size={14} />
                                            </button>
                                        ))}
                                    </div>
                                    <Button
                                        disabled={
                                            !settings.openrouterModel ||
                                            settings.favoriteOpenRouterModels.includes(
                                                settings.openrouterModel
                                            )
                                        }
                                        onClick={() =>
                                            update({
                                                favoriteOpenRouterModels: [
                                                    settings.openrouterModel,
                                                    ...settings.favoriteOpenRouterModels
                                                ]
                                            })
                                        }
                                    >
                                        <Heart size={16} /> Add selected
                                    </Button>
                                </div>
                            </SettingsSection>
                            <SettingsSection
                                title="Image providers"
                                description="Configure local or hosted image generation."
                            >
                                <label className="m-field">
                                    <span>Active provider</span>
                                    <select
                                        value={settings.imageProvider}
                                        onChange={(event) =>
                                            update({ imageProvider: event.target.value as any })
                                        }
                                    >
                                        <option value="swarm">SwarmUI</option>
                                        <option value="comfy">ComfyUI</option>
                                        <option value="nanogpt">NanoGPT</option>
                                        <option value="openrouter">OpenRouter</option>
                                    </select>
                                </label>
                                <ProviderSettings
                                    provider="swarm"
                                    settings={settings}
                                    update={update}
                                    onLoad={() => void loadImageModels('swarm')}
                                    loading={loading === 'swarm-images'}
                                    models={imageModels.swarm || []}
                                />
                                <ProviderSettings
                                    provider="comfy"
                                    settings={settings}
                                    update={update}
                                    onLoad={() => void loadImageModels('comfy')}
                                    loading={loading === 'comfy-images'}
                                    models={imageModels.comfy || []}
                                />
                                <ProviderSettings
                                    provider="nanogpt"
                                    settings={settings}
                                    update={update}
                                    onLoad={() => void loadImageModels('nanogpt')}
                                    loading={loading === 'nanogpt-images'}
                                    models={imageModels.nanogpt || []}
                                />
                                <ProviderSettings
                                    provider="openrouter"
                                    settings={settings}
                                    update={update}
                                    onLoad={() => void loadImageModels('openrouter')}
                                    loading={loading === 'openrouter-images'}
                                    models={imageModels.openrouter || []}
                                />
                            </SettingsSection>
                        </>
                    )}
                    {tab === 'generation' && (
                        <>
                            <SettingsSection
                                title="Chat generation"
                                description="Control automatic media and model context."
                            >
                                <label className="m-toggle">
                                    <input
                                        type="checkbox"
                                        checked={settings.enableImageGeneration}
                                        onChange={(event) =>
                                            update({ enableImageGeneration: event.target.checked })
                                        }
                                    />
                                    <span>
                                        <strong>Automatic images</strong>
                                        <small>
                                            Generate a visual when the assistant includes an image
                                            prompt.
                                        </small>
                                    </span>
                                </label>
                                <label className="m-field">
                                    <span>Protected image prompt language</span>
                                    <select
                                        value={settings.protectedImagePromptLanguage}
                                        onChange={(event) =>
                                            update({
                                                protectedImagePromptLanguage: event.target
                                                    .value as any
                                            })
                                        }
                                    >
                                        <option value="pl">Polish</option>
                                        <option value="en">English</option>
                                        <option value="none">Disabled</option>
                                    </select>
                                </label>
                                <label className="m-field">
                                    <span>Context messages</span>
                                    <input
                                        type="number"
                                        min={20}
                                        step={20}
                                        value={settings.contextMessageCount}
                                        onChange={(event) =>
                                            update({
                                                contextMessageCount: Number(event.target.value)
                                            })
                                        }
                                    />
                                </label>
                                <label className="m-field">
                                    <span>Composer height</span>
                                    <input
                                        type="range"
                                        min={120}
                                        max={420}
                                        value={settings.messageInputHeight}
                                        onChange={(event) =>
                                            update({
                                                messageInputHeight: Number(event.target.value)
                                            })
                                        }
                                    />
                                    <small>{settings.messageInputHeight}px</small>
                                </label>
                            </SettingsSection>
                            <SettingsSection
                                title="Default image tuning"
                                description="Used by automatic chat images and as generator defaults."
                            >
                                <div className="m-form-grid">
                                    <label className="m-field">
                                        <span>Width</span>
                                        <input
                                            type="number"
                                            value={settings.imgWidth}
                                            onChange={(event) =>
                                                update({ imgWidth: Number(event.target.value) })
                                            }
                                        />
                                    </label>
                                    <label className="m-field">
                                        <span>Height</span>
                                        <input
                                            type="number"
                                            value={settings.imgHeight}
                                            onChange={(event) =>
                                                update({ imgHeight: Number(event.target.value) })
                                            }
                                        />
                                    </label>
                                    <label className="m-field">
                                        <span>Steps</span>
                                        <input
                                            type="number"
                                            value={settings.steps}
                                            onChange={(event) =>
                                                update({ steps: Number(event.target.value) })
                                            }
                                        />
                                    </label>
                                    <label className="m-field">
                                        <span>CFG scale</span>
                                        <input
                                            type="number"
                                            step="0.5"
                                            value={settings.cfgScale}
                                            onChange={(event) =>
                                                update({ cfgScale: Number(event.target.value) })
                                            }
                                        />
                                    </label>
                                    <label className="m-field">
                                        <span>Sampler</span>
                                        <select
                                            value={settings.sampler}
                                            onChange={(event) =>
                                                update({ sampler: event.target.value })
                                            }
                                        >
                                            <option value="euler_ancestral">Euler ancestral</option>
                                            <option value="euler">Euler</option>
                                            <option value="dpmpp_2m">DPM++ 2M</option>
                                        </select>
                                    </label>
                                    <label className="m-field">
                                        <span>Scheduler</span>
                                        <select
                                            value={settings.scheduler}
                                            onChange={(event) =>
                                                update({ scheduler: event.target.value })
                                            }
                                        >
                                            <option value="karras">Karras</option>
                                            <option value="normal">Normal</option>
                                            <option value="sgm_uniform">SGM Uniform</option>
                                        </select>
                                    </label>
                                </div>
                            </SettingsSection>
                            <SettingsSection
                                title="System prompt"
                                description="The active character keeps its own system prompt."
                            >
                                <label className="m-field">
                                    <span>Current prompt</span>
                                    <textarea
                                        rows={12}
                                        value={controller.currentCharacter?.systemPrompt || ''}
                                        onChange={(event) =>
                                            controller.setData((current) => ({
                                                ...current,
                                                characters: current.characters.map((character) =>
                                                    character.id === current.currentCharacterId
                                                        ? {
                                                              ...character,
                                                              systemPrompt: event.target.value
                                                          }
                                                        : character
                                                )
                                            }))
                                        }
                                    />
                                </label>
                                <Button
                                    variant="danger"
                                    onClick={() =>
                                        window.confirm('Clear this chat and its saved memories?') &&
                                        controller.clearChat()
                                    }
                                >
                                    <Trash2 size={17} /> Clear current chat
                                </Button>
                            </SettingsSection>
                        </>
                    )}
                    {tab === 'account' && (
                        <>
                            <SettingsSection
                                title="Profile"
                                description="Update the username or secure this account with a new password."
                            >
                                <label className="m-field">
                                    <span>Username</span>
                                    <input
                                        value={profile.username}
                                        onChange={(event) =>
                                            setProfile({ ...profile, username: event.target.value })
                                        }
                                    />
                                </label>
                                <label className="m-field">
                                    <span>Current password</span>
                                    <input
                                        type="password"
                                        value={profile.currentPassword}
                                        onChange={(event) =>
                                            setProfile({
                                                ...profile,
                                                currentPassword: event.target.value
                                            })
                                        }
                                    />
                                </label>
                                <label className="m-field">
                                    <span>New password</span>
                                    <input
                                        type="password"
                                        value={profile.newPassword}
                                        onChange={(event) =>
                                            setProfile({
                                                ...profile,
                                                newPassword: event.target.value
                                            })
                                        }
                                    />
                                </label>
                                <label className="m-field">
                                    <span>Confirm new password</span>
                                    <input
                                        type="password"
                                        value={profile.confirmPassword}
                                        onChange={(event) =>
                                            setProfile({
                                                ...profile,
                                                confirmPassword: event.target.value
                                            })
                                        }
                                    />
                                </label>
                                <Button
                                    variant="primary"
                                    onClick={async () => {
                                        if (profile.newPassword !== profile.confirmPassword)
                                            return controller.notify(
                                                'New passwords do not match.',
                                                'error'
                                            );
                                        try {
                                            await updateProfile(profile);
                                            controller.notify('Profile updated.', 'success');
                                        } catch (error) {
                                            controller.notify((error as Error).message, 'error');
                                        }
                                    }}
                                >
                                    <Save size={17} /> Save profile
                                </Button>
                            </SettingsSection>
                            <SettingsSection
                                title="Session"
                                description={`Signed in as @${controller.user.username}.`}
                            >
                                <div className="m-account-summary">
                                    <CircleUserRound size={28} />
                                    <span>
                                        <strong>@{controller.user.username}</strong>
                                        <small>{controller.user.credits} credits available</small>
                                    </span>
                                </div>
                                <Button variant="danger" onClick={() => void logout()}>
                                    <LogOut size={17} /> Log out
                                </Button>
                            </SettingsSection>
                        </>
                    )}
                    {tab === 'admin' && controller.user.isAdmin && (
                        <SettingsSection
                            title="User administration"
                            description="Review accounts and update credit balances."
                        >
                            <Button onClick={() => void loadUsers()}>
                                <RefreshCw size={17} /> Refresh users
                            </Button>
                            <div className="m-admin-list">
                                {adminUsers.map((adminUser) => (
                                    <article key={adminUser.id}>
                                        <div>
                                            <strong>@{adminUser.username}</strong>
                                            <small>
                                                {adminUser.isAdmin ? 'Administrator' : 'User'} ·
                                                Current: {adminUser.credits}
                                            </small>
                                        </div>
                                        <input
                                            aria-label={`Credits for ${adminUser.username}`}
                                            type="number"
                                            min={0}
                                            value={credits[adminUser.id] ?? adminUser.credits}
                                            onChange={(event) =>
                                                setCredits({
                                                    ...credits,
                                                    [adminUser.id]: Number(event.target.value)
                                                })
                                            }
                                        />
                                        <Button
                                            onClick={async () => {
                                                try {
                                                    await updateAdminCredits(
                                                        adminUser.id,
                                                        credits[adminUser.id]
                                                    );
                                                    controller.notify(
                                                        `Updated @${adminUser.username}.`,
                                                        'success'
                                                    );
                                                    void loadUsers();
                                                } catch (error) {
                                                    controller.notify(
                                                        (error as Error).message,
                                                        'error'
                                                    );
                                                }
                                            }}
                                        >
                                            Update
                                        </Button>
                                    </article>
                                ))}
                            </div>
                        </SettingsSection>
                    )}
                </div>
                <footer>
                    <Button onClick={onClose}>Close</Button>
                    <Button
                        variant="primary"
                        onClick={() => {
                            save();
                            onClose();
                        }}
                    >
                        <Save size={17} /> Save settings
                    </Button>
                </footer>
            </aside>
        </div>
    );
}
