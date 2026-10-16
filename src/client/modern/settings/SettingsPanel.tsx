import {
    Bot,
    CircleUserRound,
    Download,
    Heart,
    LoaderCircle,
    LogOut,
    RefreshCw,
    Save,
    Trash2,
    Upload,
    UserPlus,
    UserRoundCog,
    Users,
    WandSparkles,
    X
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    createAdminUser,
    fetchAdminUsers,
    fetchOpenRouterModels,
    logout,
    updateAdminCredits,
    updateProfile
} from '../api.js';
import { Button, IconButton, useDialog } from '../components/ui.js';
import { parseModernBackup } from '../storage.js';
import type { ModernSettings } from '../types.js';
import type { ModernController } from '../useModernController.js';
import { ProviderSettings } from './ProviderSettings.js';
import { SettingsSection } from './SettingsSection.js';

// Matches the server's rule for a credit balance: a whole number from 0 to 1,000,000,000.
function isValidCreditAmount(value: string | number) {
    const text = String(value).trim();
    const amount = Number(text);
    return text !== '' && Number.isInteger(amount) && amount >= 0 && amount <= 1000000000;
}

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
    const [modelSearch, setModelSearch] = useState('');
    const [loading, setLoading] = useState('');
    const [profile, setProfile] = useState({
        username: controller.user.username,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [adminUsers, setAdminUsers] = useState<any[]>([]);
    // Typed but unsaved credit amounts, kept as text so an empty field is not read as 0.
    const [creditEdits, setCreditEdits] = useState<Record<number, string>>({});
    const [newAccount, setNewAccount] = useState({ username: '', password: '' });
    const [creatingAccount, setCreatingAccount] = useState(false);
    const panelRef = useRef<HTMLElement>(null);
    const backupInputRef = useRef<HTMLInputElement>(null);
    // Settings apply only on Save, so closing any other way asks before dropping edits.
    const latestSettings = useRef(settings);
    latestSettings.current = settings;
    const requestClose = useCallback(() => {
        const changed =
            JSON.stringify(latestSettings.current) !== JSON.stringify(controller.data.settings);
        if (changed && !window.confirm('Discard your unsaved settings changes?')) return;
        onClose();
    }, [controller.data.settings, onClose]);
    useDialog(panelRef, requestClose);
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
    async function loadUsers() {
        try {
            const users = await fetchAdminUsers();
            setAdminUsers(users);
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        }
    }
    async function restoreBackup(file: File) {
        try {
            const state = parseModernBackup(await file.text());
            const count = state.characters.length;
            if (
                !window.confirm(
                    `Replace all of your characters, chats, and settings with this backup (${count} ${count === 1 ? 'character' : 'characters'})? This cannot be undone.`
                )
            ) {
                return;
            }
            controller.restoreState(state);
            // The panel's unsaved copy of the old settings must not be saved over the backup.
            onClose();
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        }
    }
    async function createAccount() {
        setCreatingAccount(true);
        try {
            const created = await createAdminUser(newAccount.username.trim(), newAccount.password);
            setNewAccount({ username: '', password: '' });
            controller.notify(`Created @${created.username}.`, 'success');
            void loadUsers();
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        } finally {
            setCreatingAccount(false);
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
            onMouseDown={(event) => event.target === event.currentTarget && requestClose()}
        >
            <aside
                ref={panelRef}
                tabIndex={-1}
                className="m-settings"
                role="dialog"
                aria-modal="true"
                aria-label="Settings"
            >
                <header>
                    <div>
                        <span className="m-eyebrow">Workspace</span>
                        <h2>Settings</h2>
                    </div>
                    <IconButton label="Close settings" onClick={requestClose}>
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
                                description="Choose the provider for chat, prompt helpers, memory, and writing tools."
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
                                        <option value="grok-cli">
                                            Grok subscription (experimental)
                                        </option>
                                    </select>
                                </label>
                                {settings.textProvider === 'grok-cli' ? (
                                    <div className="m-provider-box">
                                        <p>
                                            Uses Grok Build signed in on the Wink server. All users
                                            share that account’s usage allowance.
                                        </p>
                                        <p>
                                            For Docker, start the host bridge with{' '}
                                            <code>npm run grok:bridge</code> on your PC (see
                                            README). Responses appear when complete. Images and
                                            voice keep their separate providers.
                                        </p>
                                        <label className="m-field">
                                            <span>Grok model (optional)</span>
                                            <input
                                                value={settings.grokModel || ''}
                                                placeholder="CLI default"
                                                onChange={(event) =>
                                                    update({ grokModel: event.target.value })
                                                }
                                            />
                                        </label>
                                    </div>
                                ) : (
                                    <>
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
                                                    onChange={(event) =>
                                                        setModelSearch(event.target.value)
                                                    }
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
                                                size={Math.min(
                                                    8,
                                                    Math.max(2, filteredModels.length)
                                                )}
                                                value={settings.openrouterModel}
                                                onChange={(event) =>
                                                    update({ openrouterModel: event.target.value })
                                                }
                                            >
                                                <option value={settings.openrouterModel}>
                                                    {settings.openrouterModel || 'Select a model'}
                                                </option>
                                                {filteredModels
                                                    .filter(
                                                        (model) =>
                                                            model !== settings.openrouterModel
                                                    )
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
                                                        openrouterReasoningEnabled:
                                                            event.target.checked
                                                    })
                                                }
                                            />
                                            <span>
                                                <strong>Reasoning</strong>
                                                <small>
                                                    Ask supported models to reason internally.
                                                </small>
                                            </span>
                                        </label>
                                        {settings.openrouterReasoningEnabled && (
                                            <label className="m-field">
                                                <span>Reasoning effort</span>
                                                <select
                                                    value={settings.openrouterReasoningEffort}
                                                    onChange={(event) =>
                                                        update({
                                                            openrouterReasoningEffort:
                                                                event.target.value
                                                        })
                                                    }
                                                >
                                                    <option>minimal</option>
                                                    <option>low</option>
                                                    <option>medium</option>
                                                    <option>high</option>
                                                    <option>xhigh</option>
                                                    <option>max</option>
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
                                    </>
                                )}
                            </SettingsSection>
                            <SettingsSection
                                title="Image providers"
                                description="Configure provider connections here. Choose image models and tuning in Create."
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
                                />
                                <ProviderSettings
                                    provider="comfy"
                                    settings={settings}
                                    update={update}
                                />
                                <ProviderSettings
                                    provider="nanogpt"
                                    settings={settings}
                                    update={update}
                                />
                                <ProviderSettings
                                    provider="openrouter"
                                    settings={settings}
                                    update={update}
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
                                    <span>Composer max height</span>
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
                                            const result = await updateProfile(profile);
                                            if (result?.user) controller.updateUser(result.user);
                                            setProfile((current) => ({
                                                ...current,
                                                username:
                                                    result?.user?.username || current.username,
                                                currentPassword: '',
                                                newPassword: '',
                                                confirmPassword: ''
                                            }));
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
                                title="Your data"
                                description="Download everything this account has saved — characters, chats, memories, and settings including API keys — or restore it from such a file."
                            >
                                <input
                                    ref={backupInputRef}
                                    hidden
                                    type="file"
                                    accept=".json,application/json"
                                    aria-label="Backup file"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        event.target.value = '';
                                        if (file) void restoreBackup(file);
                                    }}
                                />
                                <div className="m-settings-actions">
                                    <Button onClick={controller.persistence.download}>
                                        <Download size={17} /> Download a backup
                                    </Button>
                                    <Button onClick={() => backupInputRef.current?.click()}>
                                        <Upload size={17} /> Restore from a backup
                                    </Button>
                                </div>
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
                                <Button
                                    variant="danger"
                                    onClick={() =>
                                        void logout().catch((error: Error) =>
                                            controller.notify(error.message, 'error')
                                        )
                                    }
                                >
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
                                            value={creditEdits[adminUser.id] ?? adminUser.credits}
                                            onChange={(event) =>
                                                setCreditEdits({
                                                    ...creditEdits,
                                                    [adminUser.id]: event.target.value
                                                })
                                            }
                                        />
                                        <Button
                                            disabled={
                                                creditEdits[adminUser.id] === undefined ||
                                                !isValidCreditAmount(creditEdits[adminUser.id])
                                            }
                                            onClick={async () => {
                                                try {
                                                    await updateAdminCredits(
                                                        adminUser.id,
                                                        Number(creditEdits[adminUser.id])
                                                    );
                                                    setCreditEdits((current) => {
                                                        const next = { ...current };
                                                        delete next[adminUser.id];
                                                        return next;
                                                    });
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
                    {tab === 'admin' && controller.user.isAdmin && (
                        <SettingsSection
                            title="Add an account"
                            description="Create a regular account, for example while public sign-up is turned off."
                        >
                            <form
                                className="m-admin-create"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void createAccount();
                                }}
                            >
                                <label className="m-field">
                                    <span>Username</span>
                                    <input
                                        autoComplete="off"
                                        value={newAccount.username}
                                        onChange={(event) =>
                                            setNewAccount({
                                                ...newAccount,
                                                username: event.target.value
                                            })
                                        }
                                    />
                                </label>
                                <label className="m-field">
                                    <span>Password</span>
                                    <input
                                        type="password"
                                        autoComplete="new-password"
                                        value={newAccount.password}
                                        onChange={(event) =>
                                            setNewAccount({
                                                ...newAccount,
                                                password: event.target.value
                                            })
                                        }
                                    />
                                </label>
                                <Button
                                    type="submit"
                                    disabled={
                                        creatingAccount ||
                                        !newAccount.username.trim() ||
                                        !newAccount.password
                                    }
                                >
                                    <UserPlus size={17} /> Create account
                                </Button>
                            </form>
                        </SettingsSection>
                    )}
                </div>
                <footer>
                    <Button onClick={requestClose}>Close</Button>
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
