import {
    Activity,
    Archive,
    Bot,
    GitBranch,
    Check,
    ChevronDown,
    CircleUserRound,
    Copy,
    Download,
    Edit3,
    Film,
    GalleryHorizontalEnd,
    Heart,
    Image as ImageIcon,
    LoaderCircle,
    LogOut,
    Menu,
    MessageCircle,
    MoreHorizontal,
    Plus,
    RefreshCw,
    Save,
    Search,
    Send,
    Settings,
    Sparkles,
    Trash2,
    Upload,
    UserRoundCog,
    Users,
    Volume2,
    WandSparkles,
    X,
    Zap
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode
} from 'react';
import type { BootstrapUser } from '../auth.js';
import { getAssistantVisibleText } from '../utils.js';
import {
    createGeneratorJob,
    fetchAdminUsers,
    fetchOpenRouterModels,
    fetchProviderModels,
    generateImages,
    importCharacterCard,
    logout,
    saveGeneratedJobAssets,
    sendUtilityRequest,
    updateAdminCredits,
    updateGeneratorJob,
    updateProfile
} from './api.js';
import type {
    GalleryItem,
    ModernCharacter,
    ModernMessage,
    ModernSettings,
    ViewId
} from './types.js';
import { useModernController, type ModernController } from './useModernController.js';
import { parseNarrativeSegments } from './message-format.js';
import { getCharacterThumbnailUrl } from './character-thumbnails.js';
import './modern.css';

const NAV_ITEMS: Array<{ id: ViewId; label: string; icon: typeof MessageCircle }> = [
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'characters', label: 'Characters', icon: Users },
    { id: 'generator', label: 'Create', icon: WandSparkles },
    { id: 'gallery', label: 'Gallery', icon: GalleryHorizontalEnd },
    { id: 'stats', label: 'Insights', icon: Activity }
];

const MIN_COMPOSER_HEIGHT = 100;
const MAX_COMPOSER_HEIGHT = 360;

function Button({
    children,
    variant = 'secondary',
    className = '',
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
    return (
        <button className={`m-button m-button--${variant} ${className}`} {...props}>
            {children}
        </button>
    );
}

function IconButton({
    label,
    children,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
    return (
        <button className="m-icon-button" aria-label={label} title={label} {...props}>
            {children}
        </button>
    );
}

function Modal({
    title,
    children,
    onClose,
    size = 'medium'
}: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    size?: 'small' | 'medium' | 'large';
}) {
    useEffect(() => {
        const handler = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);
    return (
        <div
            className="m-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
            <section
                className={`m-modal m-modal--${size}`}
                role="dialog"
                aria-modal="true"
                aria-label={title}
            >
                <header className="m-modal__header">
                    <div>
                        <span className="m-eyebrow">EroChat Studio</span>
                        <h2>{title}</h2>
                    </div>
                    <IconButton label="Close" onClick={onClose}>
                        <X size={20} />
                    </IconButton>
                </header>
                <div className="m-modal__body">{children}</div>
            </section>
        </div>
    );
}

function Avatar({
    character,
    galleryImages,
    size = 'normal'
}: {
    character?: ModernCharacter;
    galleryImages: GalleryItem[];
    size?: 'small' | 'normal' | 'large';
}) {
    const thumbnailUrl = getCharacterThumbnailUrl(character, galleryImages);

    return (
        <span className={`m-avatar m-avatar--${size}`}>
            {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="" />
            ) : (
                <span>{character?.avatar || '✨'}</span>
            )}
        </span>
    );
}

function CharacterVisual({
    character,
    galleryImages
}: {
    character: ModernCharacter;
    galleryImages: GalleryItem[];
}) {
    const thumbnailUrl = getCharacterThumbnailUrl(character, galleryImages);
    return thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" />
    ) : (
        <span>{character.avatar || '✨'}</span>
    );
}

function Toasts({ controller }: { controller: ModernController }) {
    return (
        <div className="m-toasts" aria-live="polite">
            {controller.notices.map((notice) => (
                <button
                    key={notice.id}
                    className={`m-toast m-toast--${notice.type}`}
                    onClick={() => controller.dismissNotice(notice.id)}
                >
                    <span>{notice.message}</span>
                    <X size={16} />
                </button>
            ))}
        </div>
    );
}

function AppSidebar({
    controller,
    open,
    onClose,
    onSettings
}: {
    controller: ModernController;
    open: boolean;
    onClose: () => void;
    onSettings: () => void;
}) {
    return (
        <>
            {open && (
                <button
                    className="m-mobile-scrim"
                    aria-label="Close navigation"
                    onClick={onClose}
                />
            )}
            <aside className={`m-sidebar ${open ? 'is-open' : ''}`}>
                <div className="m-brand">
                    <span className="m-brand__mark">
                        <img src="/favicon.png" alt="" />
                    </span>
                    <div>
                        <strong>EroChat</strong>
                        <span>Studio</span>
                    </div>
                </div>
                <nav className="m-sidebar__nav" aria-label="Main navigation">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                aria-label={item.label}
                                className={
                                    controller.data.currentView === item.id ? 'is-active' : ''
                                }
                                onClick={() => {
                                    controller.setView(item.id);
                                    onClose();
                                }}
                            >
                                <Icon size={20} />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>
                <div className="m-sidebar__character">
                    <span className="m-eyebrow">Active character</span>
                    <button onClick={() => controller.setView('characters')}>
                        <Avatar
                            character={controller.currentCharacter}
                            galleryImages={controller.data.galleryImages}
                            size="small"
                        />
                        <span>
                            <strong>{controller.currentCharacter?.name}</strong>
                            <small>{controller.messages.length} messages</small>
                        </span>
                        <MoreHorizontal size={18} />
                    </button>
                </div>
                <div className="m-sidebar__footer">
                    <button aria-label="Settings" onClick={onSettings}>
                        <Settings size={20} />
                        <span>Settings</span>
                    </button>
                    <button aria-label="Log out" onClick={() => void logout()}>
                        <LogOut size={20} />
                        <span>Log out</span>
                    </button>
                </div>
            </aside>
        </>
    );
}

function Topbar({
    controller,
    onMenu,
    onSettings
}: {
    controller: ModernController;
    onMenu: () => void;
    onSettings: () => void;
}) {
    const titles: Record<ViewId, [string, string]> = {
        chat: ['Conversation', controller.currentCharacter?.name || 'Chat'],
        characters: ['Your cast', 'Characters'],
        generator: ['Creative suite', 'Image generator'],
        gallery: ['Media library', 'Gallery'],
        stats: ['Your activity', 'Insights']
    };
    return (
        <header className="m-topbar">
            <IconButton label="Open navigation" className="m-menu-button" onClick={onMenu}>
                <Menu size={22} />
            </IconButton>
            <div className="m-topbar__title">
                <span>{titles[controller.data.currentView][0]}</span>
                <h1>{titles[controller.data.currentView][1]}</h1>
            </div>
            <div className="m-topbar__status">
                <span className="m-status">
                    <i /> Connected
                </span>
                <span className="m-credit">
                    <Zap size={15} /> {controller.user.credits}
                </span>
                <button className="m-user-button" aria-label="Open settings" onClick={onSettings}>
                    <CircleUserRound size={20} />
                    <span>@{controller.user.username}</span>
                </button>
            </div>
        </header>
    );
}

function MessageCard({
    message,
    controller,
    onEdit,
    onLightbox
}: {
    message: ModernMessage;
    controller: ModernController;
    onEdit: (message: ModernMessage) => void;
    onLightbox: (url: string, video?: boolean) => void;
}) {
    const assistant = message.role === 'assistant';
    const hasMedia = assistant && Boolean(message.imageUrl || message.videoUrl);
    const visible = assistant ? getAssistantVisibleText(message.content) : message.content;
    return (
        <article
            className={`m-message ${assistant ? 'is-assistant' : 'is-user'} ${hasMedia ? 'has-media' : ''} ${message.archivedFromModelContext ? 'is-archived' : ''}`}
        >
            <div className="m-message__avatar">
                {assistant ? (
                    <Avatar
                        character={controller.currentCharacter}
                        galleryImages={controller.data.galleryImages}
                        size="small"
                    />
                ) : (
                    <span className="m-avatar m-avatar--small">
                        <CircleUserRound size={20} />
                    </span>
                )}
            </div>
            <div className="m-message__content">
                <div className="m-message__meta">
                    <strong>{assistant ? controller.currentCharacter?.name : 'You'}</strong>
                    {message.editedAt && <span>Edited</span>}
                    {message.archivedFromModelContext && (
                        <span>
                            <Archive size={12} /> Memory
                        </span>
                    )}
                </div>
                <div className="m-message__body">
                    <div className="m-message__text">
                        {visible.split('\n').map((line, index) => (
                            <p key={index}>
                                {line ? (
                                    parseNarrativeSegments(line).map((segment, segmentIndex) =>
                                        segment.narrative ? (
                                            <em className="m-message__narration" key={segmentIndex}>
                                                {segment.text}
                                            </em>
                                        ) : (
                                            <span key={segmentIndex}>{segment.text}</span>
                                        )
                                    )
                                ) : (
                                    <br />
                                )}
                            </p>
                        ))}
                    </div>
                    {(message.imageUrl || message.videoUrl) && (
                        <div className="m-message__media-column">
                            {message.imageUrl && (
                                <button
                                    className="m-message__media"
                                    onClick={() => onLightbox(message.imageUrl!)}
                                >
                                    <img
                                        src={message.imageUrl}
                                        alt="Generated scene"
                                        loading="lazy"
                                    />
                                </button>
                            )}
                            {message.videoUrl && (
                                <button
                                    className="m-message__media"
                                    onClick={() => onLightbox(message.videoUrl!, true)}
                                >
                                    <video src={message.videoUrl} muted playsInline />
                                </button>
                            )}
                        </div>
                    )}
                </div>
                <div className="m-message__actions">
                    {assistant && (
                        <button onClick={() => void controller.playTts(message)}>
                            <Volume2 size={15} /> Read
                        </button>
                    )}
                    {assistant && (
                        <button onClick={() => onEdit(message)}>
                            <Edit3 size={15} /> Edit
                        </button>
                    )}
                    {assistant && (
                        <button
                            disabled={controller.busy === `image:${message.id}`}
                            onClick={() => void controller.regenerateMessageImage(message.id)}
                        >
                            <RefreshCw size={15} /> Image
                        </button>
                    )}
                    <button onClick={() => controller.branchFromMessage(message.id)}>
                        <GitBranch size={15} /> Branch
                    </button>
                    <button
                        onClick={() =>
                            window.confirm(
                                'Remove this message from chat history and future context?'
                            ) && controller.removeMessage(message.id)
                        }
                    >
                        <Trash2 size={15} /> Remove
                    </button>
                </div>
            </div>
        </article>
    );
}

function MemoryPanel({ controller }: { controller: ModernController }) {
    const [text, setText] = useState(controller.memoryDraft?.text || '');
    useEffect(() => {
        setText(controller.memoryDraft?.text || '');
    }, [controller.memoryDraft]);
    const active = controller.messages.filter(
        (message) => !message.archivedFromModelContext
    ).length;
    const archived = controller.messages.length - active;
    const limit =
        controller.currentCharacter?.contextMessageCount ||
        controller.data.settings.contextMessageCount;
    const pressure = active >= limit * 2;
    return (
        <section className={`m-memory ${pressure ? 'is-warning' : ''}`}>
            <div className="m-memory__summary">
                <span>
                    {active}/{limit * 2} active messages
                </span>
                <span>{archived} archived</span>
                <span>{controller.currentCharacter?.memorySnapshots?.length || 0} memories</span>
            </div>
            {pressure && !controller.memoryDraft && (
                <div className="m-memory__decision">
                    <div>
                        <strong>Memory review required</strong>
                        <p>Compress the oldest context block or raise this chat’s limit.</p>
                    </div>
                    <div>
                        <Button
                            onClick={() => void controller.compressMemory()}
                            disabled={controller.busy === 'memory'}
                        >
                            {controller.busy === 'memory' ? (
                                <LoaderCircle className="spin" size={17} />
                            ) : (
                                <Archive size={17} />
                            )}{' '}
                            Compress memory
                        </Button>
                        <Button onClick={() => controller.increaseContextLimit(20)}>
                            Increase +20
                        </Button>
                    </div>
                </div>
            )}
            {controller.memoryDraft && (
                <div className="m-memory__review">
                    <label>
                        <span>Review memory snapshot</span>
                        <textarea
                            rows={5}
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                        />
                    </label>
                    <div>
                        <Button variant="primary" onClick={() => controller.acceptMemory(text)}>
                            <Check size={17} /> Accept
                        </Button>
                        <Button onClick={() => void controller.compressMemory()}>
                            <RefreshCw size={17} /> Regenerate
                        </Button>
                        <Button onClick={() => controller.setMemoryDraft(null)}>Reject</Button>
                    </div>
                </div>
            )}
        </section>
    );
}

function ChatView({ controller }: { controller: ModernController }) {
    const [draft, setDraft] = useState('');
    const [upgradeMode, setUpgradeMode] = useState('normal');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [preview, setPreview] = useState<any>(null);
    const [editing, setEditing] = useState<ModernMessage | null>(null);
    const [lightbox, setLightbox] = useState<{ url: string; video?: boolean } | null>(null);
    const [composerHeight, setComposerHeight] = useState(
        controller.data.settings.messageInputHeight
    );
    const endRef = useRef<HTMLDivElement>(null);
    const composerHeightRef = useRef(composerHeight);
    const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
    useEffect(() => {
        endRef.current?.scrollIntoView?.({ block: 'end' });
    }, [controller.messages.length]);
    useEffect(() => {
        if (!resizeRef.current) {
            composerHeightRef.current = controller.data.settings.messageInputHeight;
            setComposerHeight(controller.data.settings.messageInputHeight);
        }
    }, [controller.data.settings.messageInputHeight]);
    function setInputHeight(height: number, persist = false) {
        const nextHeight = Math.max(
            MIN_COMPOSER_HEIGHT,
            Math.min(MAX_COMPOSER_HEIGHT, Math.round(height))
        );
        composerHeightRef.current = nextHeight;
        setComposerHeight(nextHeight);
        if (persist) {
            controller.updateSettings({ messageInputHeight: nextHeight });
        }
    }
    function startComposerResize(event: ReactPointerEvent<HTMLDivElement>) {
        resizeRef.current = {
            startY: event.clientY,
            startHeight: composerHeightRef.current
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
    }
    function resizeComposer(event: ReactPointerEvent<HTMLDivElement>) {
        if (!resizeRef.current) return;
        setInputHeight(resizeRef.current.startHeight + resizeRef.current.startY - event.clientY);
    }
    function finishComposerResize(event: ReactPointerEvent<HTMLDivElement>) {
        if (!resizeRef.current) return;
        resizeRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        controller.updateSettings({ messageInputHeight: composerHeightRef.current });
    }
    function resizeComposerWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        setInputHeight(composerHeightRef.current + (event.key === 'ArrowUp' ? 16 : -16), true);
    }
    async function submit() {
        if (await controller.sendMessage(draft)) {
            setDraft('');
            setSuggestions([]);
        }
    }
    return (
        <div className="m-chat">
            <div className="m-chat__stream">
                {controller.messages.length === 0 && (
                    <div className="m-chat-empty">
                        <Avatar
                            character={controller.currentCharacter}
                            galleryImages={controller.data.galleryImages}
                            size="large"
                        />
                        <span className="m-eyebrow">A new scene begins</span>
                        <h2>Start a conversation with {controller.currentCharacter?.name}</h2>
                        <p>
                            Write the opening line, ask for suggestions, or configure the character
                            and providers in Settings.
                        </p>
                    </div>
                )}
                {controller.messages.map((message) => (
                    <MessageCard
                        key={message.id}
                        message={message}
                        controller={controller}
                        onEdit={setEditing}
                        onLightbox={(url, video) => setLightbox({ url, video })}
                    />
                ))}
                {controller.busy === 'chat' && (
                    <div className="m-typing">
                        <Avatar
                            character={controller.currentCharacter}
                            galleryImages={controller.data.galleryImages}
                            size="small"
                        />
                        <span>
                            <i />
                            <i />
                            <i />
                        </span>
                        <small>{controller.currentCharacter?.name} is composing…</small>
                    </div>
                )}
                <div ref={endRef} />
            </div>
            <div className="m-composer-wrap">
                <MemoryPanel controller={controller} />
                {suggestions.length > 0 && (
                    <div className="m-suggestions">
                        {suggestions.map((suggestion) => (
                            <button key={suggestion} onClick={() => setDraft(suggestion)}>
                                {suggestion}
                            </button>
                        ))}
                    </div>
                )}
                <div className="m-composer">
                    <div
                        className="m-composer__resize-handle"
                        role="separator"
                        tabIndex={0}
                        aria-label="Resize message input"
                        aria-orientation="horizontal"
                        aria-valuemin={MIN_COMPOSER_HEIGHT}
                        aria-valuemax={MAX_COMPOSER_HEIGHT}
                        aria-valuenow={composerHeight}
                        onPointerDown={startComposerResize}
                        onPointerMove={resizeComposer}
                        onPointerUp={finishComposerResize}
                        onPointerCancel={finishComposerResize}
                        onKeyDown={resizeComposerWithKeyboard}
                    >
                        <span />
                    </div>
                    <select
                        aria-label="Quick model"
                        value={controller.data.settings.openrouterModel}
                        onChange={(event) =>
                            controller.updateSettings({ openrouterModel: event.target.value })
                        }
                    >
                        <option value={controller.data.settings.openrouterModel}>
                            {controller.data.settings.openrouterModel || 'Choose a model'}
                        </option>
                        {controller.data.settings.favoriteOpenRouterModels
                            .filter((model) => model !== controller.data.settings.openrouterModel)
                            .map((model) => (
                                <option key={model}>{model}</option>
                            ))}
                    </select>
                    <textarea
                        aria-label="Message"
                        placeholder={`Message ${controller.currentCharacter?.name || 'your character'}…`}
                        value={draft}
                        style={{ height: composerHeight }}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                void submit();
                            }
                        }}
                    />
                    <div className="m-composer__actions">
                        <div>
                            <Button
                                variant="ghost"
                                onClick={async () =>
                                    setSuggestions(await controller.fetchSuggestions())
                                }
                                disabled={controller.busy === 'suggestions'}
                            >
                                <Sparkles size={17} /> Suggest
                            </Button>
                            <Button
                                variant="ghost"
                                disabled={!draft.trim()}
                                onClick={() => setPreview(controller.getRequestPreview(draft))}
                            >
                                <Copy size={17} /> Request
                            </Button>
                            <div className="m-split-action">
                                <Button
                                    variant="ghost"
                                    disabled={!draft.trim() || controller.busy === 'upgrade'}
                                    onClick={async () =>
                                        setDraft(await controller.upgradeDraft(draft, upgradeMode))
                                    }
                                >
                                    <WandSparkles size={17} /> Upgrade
                                </Button>
                                <select
                                    aria-label="Upgrade level"
                                    value={upgradeMode}
                                    onChange={(event) => setUpgradeMode(event.target.value)}
                                >
                                    <option value="minimal">Minimal</option>
                                    <option value="normal">Normal</option>
                                    <option value="full">Full</option>
                                </select>
                            </div>
                        </div>
                        <Button
                            variant="primary"
                            className="m-send"
                            onClick={() => void submit()}
                            disabled={!draft.trim() || controller.busy === 'chat'}
                        >
                            {controller.busy === 'chat' ? (
                                <LoaderCircle className="spin" size={18} />
                            ) : (
                                <Send size={18} />
                            )}
                            <span>Send</span>
                        </Button>
                    </div>
                </div>
            </div>
            {preview && (
                <Modal title="Request preview" onClose={() => setPreview(null)} size="large">
                    <div className="m-request-meta">
                        <span>{preview.provider}</span>
                        <code>{preview.url}</code>
                        <Button
                            onClick={() => {
                                void navigator.clipboard.writeText(preview.displayText);
                                controller.notify('Request copied.', 'success');
                            }}
                        >
                            <Copy size={16} /> Copy
                        </Button>
                    </div>
                    <pre className="m-code-block">{preview.displayText}</pre>
                </Modal>
            )}
            {editing && (
                <EditMessageModal
                    message={editing}
                    onClose={() => setEditing(null)}
                    onSave={(content) => {
                        controller.editMessage(editing.id, content);
                        setEditing(null);
                    }}
                />
            )}
            {lightbox && (
                <Modal title="Media preview" onClose={() => setLightbox(null)} size="large">
                    <div className="m-lightbox">
                        {lightbox.video ? (
                            <video src={lightbox.url} controls autoPlay />
                        ) : (
                            <img src={lightbox.url} alt="Full size media" />
                        )}
                        <a className="m-button m-button--secondary" href={lightbox.url} download>
                            <Download size={17} /> Download
                        </a>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function EditMessageModal({
    message,
    onClose,
    onSave
}: {
    message: ModernMessage;
    onClose: () => void;
    onSave: (content: string) => void;
}) {
    const [content, setContent] = useState(message.content);
    return (
        <Modal title="Edit assistant message" onClose={onClose}>
            <label className="m-field">
                <span>Message content</span>
                <textarea
                    rows={12}
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                />
            </label>
            <div className="m-modal-actions">
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="primary" onClick={() => onSave(content)}>
                    <Save size={17} /> Save changes
                </Button>
            </div>
        </Modal>
    );
}

function CharacterEditor({
    controller,
    character,
    onClose
}: {
    controller: ModernController;
    character?: ModernCharacter;
    onClose: () => void;
}) {
    const [draft, setDraft] = useState<ModernCharacter>(() =>
        character
            ? { ...character }
            : {
                  id: crypto.randomUUID(),
                  name: '',
                  avatar: '✨',
                  systemPrompt: '',
                  description: '',
                  messages: [],
                  memorySnapshots: [],
                  contextMessageCount: controller.data.settings.contextMessageCount
              }
    );
    const update = (patch: Partial<ModernCharacter>) =>
        setDraft((current) => ({ ...current, ...patch }));
    return (
        <Modal
            title={character ? `Edit ${character.name}` : 'Create character'}
            onClose={onClose}
            size="large"
        >
            <div className="m-character-editor">
                <div className="m-character-editor__identity">
                    <div className="m-thumbnail-editor" aria-label="Character avatar preview">
                        {draft.thumbnail ? (
                            <img src={draft.thumbnail} alt="Character thumbnail" />
                        ) : (
                            <span>{draft.avatar || '✨'}</span>
                        )}
                    </div>
                    <div>
                        <label className="m-field">
                            <span>Name *</span>
                            <input
                                value={draft.name}
                                onChange={(event) => update({ name: event.target.value })}
                            />
                        </label>
                        <label className="m-field">
                            <span>Avatar</span>
                            <input
                                value={draft.avatar || ''}
                                onChange={(event) => update({ avatar: event.target.value })}
                            />
                        </label>
                    </div>
                </div>
                <div className="m-form-grid">
                    <label className="m-field m-field--wide">
                        <span>Description *</span>
                        <textarea
                            rows={4}
                            value={draft.description || ''}
                            onChange={(event) => update({ description: event.target.value })}
                        />
                    </label>
                    <label className="m-field m-field--wide">
                        <span>System prompt *</span>
                        <textarea
                            rows={12}
                            value={draft.systemPrompt || ''}
                            onChange={(event) => update({ systemPrompt: event.target.value })}
                        />
                    </label>
                </div>
            </div>
            <div className="m-modal-actions">
                {character && !character.isDefault && (
                    <Button
                        variant="danger"
                        onClick={() => {
                            if (window.confirm(`Delete ${character.name}?`)) {
                                controller.deleteCharacter(character.id);
                                onClose();
                            }
                        }}
                    >
                        <Trash2 size={17} /> Delete
                    </Button>
                )}
                <span />
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant="primary"
                    disabled={
                        !draft.name.trim() ||
                        !draft.description?.trim() ||
                        !draft.systemPrompt.trim()
                    }
                    onClick={() => {
                        controller.saveCharacter({ ...draft, name: draft.name.trim() });
                        onClose();
                    }}
                >
                    <Save size={17} /> Save character
                </Button>
            </div>
        </Modal>
    );
}

function CharactersView({ controller }: { controller: ModernController }) {
    const [editing, setEditing] = useState<ModernCharacter | undefined>();
    const [creating, setCreating] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    async function handleImport(file?: File) {
        if (!file) return;
        try {
            const result = await importCharacterCard(file);
            const raw = result.card?.data;
            if (!raw?.name) throw new Error('The character card payload was malformed.');
            const name = String(raw.name).trim();
            const replace = (value: unknown) =>
                String(value || '')
                    .replace(/\{\{\s*char\s*\}\}/gi, name)
                    .replace(/\{\{\s*user\s*\}\}/gi, controller.user.username)
                    .trim();
            const greeting = replace(raw.first_mes);
            const description = replace(raw.description);
            const background = [
                replace(raw.personality) && `Personality:\n${replace(raw.personality)}`,
                replace(raw.scenario) && `Scenario:\n${replace(raw.scenario)}`,
                replace(raw.creator_notes) && `Creator notes:\n${replace(raw.creator_notes)}`
            ]
                .filter(Boolean)
                .join('\n\n');
            controller.saveCharacter({
                id: crypto.randomUUID(),
                name,
                avatar: '✨',
                thumbnail: result.thumbnailUrl || undefined,
                description,
                background,
                greeting,
                appearance: '',
                userInfo: '',
                systemPrompt: [
                    `You are roleplaying as ${name}. Stay in character and respond naturally.`,
                    description && `Description:\n${description}`,
                    background,
                    replace(raw.mes_example) && `Example dialogue:\n${replace(raw.mes_example)}`
                ]
                    .filter(Boolean)
                    .join('\n\n'),
                messages: greeting
                    ? [{ id: crypto.randomUUID(), role: 'assistant', content: greeting }]
                    : [],
                memorySnapshots: [],
                contextMessageCount: controller.data.settings.contextMessageCount,
                openrouterSessionId: null
            });
            controller.notify('Character imported.', 'success');
        } catch (error) {
            controller.notify((error as Error).message, 'error');
        }
    }
    return (
        <div className="m-page">
            <section className="m-page-hero">
                <div>
                    <span className="m-eyebrow">Character library</span>
                    <h2>Build a cast worth returning to.</h2>
                    <p>
                        Each character keeps an independent conversation, memory, visual identity,
                        and OpenRouter session.
                    </p>
                </div>
                <div>
                    <input
                        ref={inputRef}
                        hidden
                        type="file"
                        accept=".json,.png,application/json,image/png"
                        onChange={(event) => void handleImport(event.target.files?.[0])}
                    />
                    <Button onClick={() => inputRef.current?.click()}>
                        <Upload size={17} /> Import card
                    </Button>
                    <Button variant="primary" onClick={() => setCreating(true)}>
                        <Plus size={17} /> New character
                    </Button>
                </div>
            </section>
            <section className="m-character-grid">
                {controller.data.characters.map((character) => (
                    <article
                        key={character.id}
                        className={`m-character-card ${character.id === controller.currentCharacter?.id ? 'is-active' : ''}`}
                    >
                        <button
                            className="m-character-card__visual"
                            onClick={() => controller.selectCharacter(character.id)}
                        >
                            <CharacterVisual
                                character={character}
                                galleryImages={controller.data.galleryImages}
                            />
                            <i>{character.messages.length} messages</i>
                        </button>
                        <div className="m-character-card__body">
                            <span className="m-eyebrow">
                                {character.isDefault
                                    ? 'Default'
                                    : character.id === controller.currentCharacter?.id
                                      ? 'Active now'
                                      : 'Character'}
                            </span>
                            <h3>{character.name}</h3>
                            <p>
                                {character.description ||
                                    character.appearance ||
                                    'No description yet.'}
                            </p>
                            <div>
                                <Button variant="ghost" onClick={() => setEditing(character)}>
                                    <Edit3 size={16} /> Edit
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={() => controller.selectCharacter(character.id)}
                                >
                                    <MessageCircle size={16} /> Chat
                                </Button>
                            </div>
                        </div>
                    </article>
                ))}
            </section>
            {(creating || editing) && (
                <CharacterEditor
                    controller={controller}
                    character={editing}
                    onClose={() => {
                        setEditing(undefined);
                        setCreating(false);
                    }}
                />
            )}
        </div>
    );
}

const PROMPT_CHIPS = [
    'cinematic lighting',
    'shallow depth of field',
    'editorial portrait',
    'volumetric atmosphere',
    '35mm film grain',
    'dynamic composition'
];

function GeneratorView({ controller }: { controller: ModernController }) {
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
                          : settings.nanogptModel,
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

function mergedGallery(controller: ModernController): GalleryItem[] {
    const generated: GalleryItem[] = controller.generatorAssets.map((asset) => ({
        id: `generator-${asset.id}`,
        imageUrl: asset.mediaType === 'image' ? asset.url : null,
        videoUrl: asset.mediaType === 'video' ? asset.url : null,
        source: 'generator',
        createdAt: asset.createdAt,
        metadata: asset.metadata
    }));
    const all = [...controller.data.galleryImages, ...generated];
    const query = controller.data.gallerySearchQuery.trim().toLowerCase();
    return all
        .filter((item) => {
            const sourceOk =
                controller.data.gallerySourceFilter === 'all' ||
                String(item.source).includes(controller.data.gallerySourceFilter);
            const charOk =
                controller.data.galleryFilterCharacterId === 'all' ||
                item.characterId === controller.data.galleryFilterCharacterId;
            const haystack = JSON.stringify(item).toLowerCase();
            return (
                sourceOk &&
                charOk &&
                (!query ||
                    query
                        .split(/\s+/)
                        .every((term) => haystack.includes(term.replace(/^\w+:/, ''))))
            );
        })
        .sort((a, b) => {
            const order =
                new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            return controller.data.gallerySortOrder === 'oldest' ? -order : order;
        });
}

function GalleryView({ controller }: { controller: ModernController }) {
    const [lightbox, setLightbox] = useState<GalleryItem | null>(null);
    const [thumbnailTarget, setThumbnailTarget] = useState(
        controller.currentCharacter?.id || 'default'
    );
    const items = useMemo(
        () => mergedGallery(controller),
        [
            controller.data.galleryImages,
            controller.generatorAssets,
            controller.data.gallerySearchQuery,
            controller.data.gallerySortOrder,
            controller.data.gallerySourceFilter,
            controller.data.galleryFilterCharacterId
        ]
    );
    return (
        <div className="m-page">
            <section className="m-page-hero">
                <div>
                    <span className="m-eyebrow">Media library</span>
                    <h2>Every scene, in one place.</h2>
                    <p>Browse chat images and generator output together.</p>
                </div>
            </section>
            <section className="m-gallery-tools">
                <label className="m-search">
                    <Search size={18} />
                    <input
                        aria-label="Search gallery"
                        placeholder="Search prompts, models, tags, dates…"
                        value={controller.data.gallerySearchQuery}
                        onChange={(event) =>
                            controller.setGalleryFilters({ gallerySearchQuery: event.target.value })
                        }
                    />
                </label>
                <select
                    aria-label="Sort gallery"
                    value={controller.data.gallerySortOrder}
                    onChange={(event) =>
                        controller.setGalleryFilters({ gallerySortOrder: event.target.value })
                    }
                >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                </select>
                <select
                    aria-label="Filter source"
                    value={controller.data.gallerySourceFilter}
                    onChange={(event) =>
                        controller.setGalleryFilters({ gallerySourceFilter: event.target.value })
                    }
                >
                    <option value="all">All sources</option>
                    <option value="chat">Chat</option>
                    <option value="generator">Generator</option>
                    <option value="regenerate">Regenerated</option>
                </select>
                <select
                    aria-label="Filter character"
                    value={controller.data.galleryFilterCharacterId}
                    onChange={(event) =>
                        controller.setGalleryFilters({
                            galleryFilterCharacterId: event.target.value
                        })
                    }
                >
                    <option value="all">All characters</option>
                    {controller.data.characters.map((character) => (
                        <option key={character.id} value={character.id}>
                            {character.name}
                        </option>
                    ))}
                </select>
            </section>
            {items.length ? (
                <section className="m-gallery-grid">
                    {items.map((item) => (
                        <article key={item.id} className="m-gallery-card">
                            <button onClick={() => setLightbox(item)}>
                                {item.videoUrl ? (
                                    <video src={item.videoUrl} muted playsInline />
                                ) : (
                                    <img
                                        src={item.imageUrl || ''}
                                        alt="Generated media"
                                        loading="lazy"
                                    />
                                )}
                                <span>{item.source || 'chat'}</span>
                            </button>
                            <div>
                                <strong>
                                    {item.characterName ||
                                        (item.source === 'generator' ? 'Generator' : 'Scene')}
                                </strong>
                                <small>
                                    {item.createdAt
                                        ? new Date(item.createdAt).toLocaleDateString()
                                        : 'Saved media'}
                                </small>
                            </div>
                        </article>
                    ))}
                </section>
            ) : (
                <div className="m-empty-panel large">
                    <GalleryHorizontalEnd size={34} />
                    <h3>No media matches these filters.</h3>
                    <p>Generate an image in chat or the creative suite to start your gallery.</p>
                </div>
            )}
            {lightbox && (
                <Modal title="Gallery preview" onClose={() => setLightbox(null)} size="large">
                    <div className="m-lightbox">
                        {lightbox.videoUrl ? (
                            <video src={lightbox.videoUrl} controls autoPlay />
                        ) : (
                            <img src={lightbox.imageUrl || ''} alt="Gallery preview" />
                        )}
                        <div className="m-lightbox__actions">
                            <select
                                value={thumbnailTarget}
                                onChange={(event) => setThumbnailTarget(event.target.value)}
                            >
                                {controller.data.characters.map((character) => (
                                    <option key={character.id} value={character.id}>
                                        {character.name}
                                    </option>
                                ))}
                            </select>
                            {lightbox.imageUrl && (
                                <Button
                                    onClick={() => {
                                        controller.setCharacterThumbnail(
                                            thumbnailTarget,
                                            lightbox.imageUrl!
                                        );
                                        controller.notify(
                                            'Character thumbnail updated.',
                                            'success'
                                        );
                                    }}
                                >
                                    <CircleUserRound size={17} /> Use as thumbnail
                                </Button>
                            )}
                            <a
                                className="m-button m-button--secondary"
                                href={lightbox.imageUrl || lightbox.videoUrl || ''}
                                download
                            >
                                <Download size={17} /> Download
                            </a>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function StatsView({ controller }: { controller: ModernController }) {
    const messages = controller.data.characters.flatMap((character) => character.messages || []);
    const userMessages = messages.filter((message) => message.role === 'user').length;
    const assistantMessages = messages.filter((message) => message.role === 'assistant').length;
    const images =
        controller.data.galleryImages.filter((item) => item.imageUrl).length +
        controller.generatorAssets.length;
    const cards = [
        { label: 'Messages sent', value: userMessages, icon: Send },
        { label: 'Replies received', value: assistantMessages, icon: MessageCircle },
        { label: 'Images created', value: images, icon: ImageIcon },
        { label: 'Characters', value: controller.data.characters.length, icon: Users }
    ];
    const activity = Object.entries(controller.data.statistics.dailyActivity || {}).slice(-14);
    return (
        <div className="m-page">
            <section className="m-page-hero">
                <div>
                    <span className="m-eyebrow">Personal insights</span>
                    <h2>Your creative rhythm.</h2>
                    <p>
                        Statistics stay in this browser profile and update as you use chat and
                        generation.
                    </p>
                </div>
            </section>
            <section className="m-stat-grid">
                {cards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <article key={card.label}>
                            <span>
                                <Icon size={20} />
                            </span>
                            <strong>{card.value}</strong>
                            <small>{card.label}</small>
                        </article>
                    );
                })}
            </section>
            <section className="m-insight-grid">
                <article className="m-insight-panel wide">
                    <header>
                        <div>
                            <span className="m-eyebrow">Recent activity</span>
                            <h3>Last 14 tracked days</h3>
                        </div>
                    </header>
                    {activity.length ? (
                        <div className="m-activity-chart">
                            {activity.map(([date, value]: any) => (
                                <div key={date}>
                                    <span
                                        style={{
                                            height: `${Math.max(8, Math.min(100, ((value.messagesSent || 0) + (value.imagesGenerated || 0)) * 10))}%`
                                        }}
                                    />
                                    <small>{date.slice(5)}</small>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="m-empty-inline">
                            <Activity size={22} /> Activity appears after you chat or generate
                            media.
                        </div>
                    )}
                </article>
                <article className="m-insight-panel">
                    <header>
                        <span className="m-eyebrow">Characters</span>
                        <h3>Conversation split</h3>
                    </header>
                    <div className="m-ranking">
                        {controller.data.characters
                            .slice()
                            .sort((a, b) => b.messages.length - a.messages.length)
                            .map((character) => (
                                <div key={character.id}>
                                    <Avatar
                                        character={character}
                                        galleryImages={controller.data.galleryImages}
                                        size="small"
                                    />
                                    <span>
                                        <strong>{character.name}</strong>
                                        <small>{character.messages.length} messages</small>
                                    </span>
                                    <i
                                        style={{
                                            width: `${Math.min(100, character.messages.length * 4)}%`
                                        }}
                                    />
                                </div>
                            ))}
                    </div>
                </article>
                <article className="m-insight-panel">
                    <header>
                        <span className="m-eyebrow">Models</span>
                        <h3>Saved quick access</h3>
                    </header>
                    <div className="m-ranking">
                        {controller.data.settings.favoriteOpenRouterModels.length ? (
                            controller.data.settings.favoriteOpenRouterModels.map((model) => (
                                <div key={model}>
                                    <span>
                                        <strong>{model}</strong>
                                        <small>Favorite model</small>
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="m-empty-inline">Favorite models appear here.</div>
                        )}
                    </div>
                </article>
            </section>
        </div>
    );
}

function SettingsPanel({
    controller,
    onClose
}: {
    controller: ModernController;
    onClose: () => void;
}) {
    const [tab, setTab] = useState<'providers' | 'generation' | 'account' | 'admin'>('providers');
    const [settings, setSettings] = useState<ModernSettings>({ ...controller.data.settings });
    const [models, setModels] = useState<string[]>([]);
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
    async function loadModels(provider: string) {
        setLoading(provider);
        try {
            const list =
                provider === 'openrouter'
                    ? await fetchOpenRouterModels(settings)
                    : await fetchProviderModels(provider, settings);
            setModels(list);
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
    const filteredModels = models
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
                                            onClick={() => void loadModels('openrouter')}
                                            disabled={loading === 'openrouter'}
                                        >
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
                                    </select>
                                </label>
                                <ProviderSettings
                                    provider="swarm"
                                    settings={settings}
                                    update={update}
                                    onLoad={() => void loadModels('swarm')}
                                    loading={loading === 'swarm'}
                                    models={models}
                                />
                                <ProviderSettings
                                    provider="comfy"
                                    settings={settings}
                                    update={update}
                                    onLoad={() => void loadModels('comfy')}
                                    loading={loading === 'comfy'}
                                    models={models}
                                />
                                <ProviderSettings
                                    provider="nanogpt"
                                    settings={settings}
                                    update={update}
                                    onLoad={() => void loadModels('nanogpt')}
                                    loading={loading === 'nanogpt'}
                                    models={models}
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

function SettingsSection({
    title,
    description,
    children
}: {
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <section className="m-settings-section">
            <header>
                <h3>{title}</h3>
                <p>{description}</p>
            </header>
            <div>{children}</div>
        </section>
    );
}

function ProviderSettings({
    provider,
    settings,
    update,
    onLoad,
    loading,
    models
}: {
    provider: 'swarm' | 'comfy' | 'nanogpt';
    settings: ModernSettings;
    update: (patch: Partial<ModernSettings>) => void;
    onLoad: () => void;
    loading: boolean;
    models: string[];
}) {
    if (settings.imageProvider !== provider) return null;
    const labels = { swarm: 'SwarmUI', comfy: 'ComfyUI', nanogpt: 'NanoGPT' };
    const urlKey = `${provider}Url` as keyof ModernSettings;
    const modelKey = `${provider}Model` as keyof ModernSettings;
    return (
        <div className="m-provider-box">
            <span className="m-eyebrow">{labels[provider]} connection</span>
            <label className="m-field">
                <span>Base URL</span>
                <input
                    value={String(settings[urlKey] || '')}
                    onChange={(event) => update({ [urlKey]: event.target.value })}
                />
            </label>
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
            <label className="m-field">
                <span>Model</span>
                <div className="m-inline">
                    <input
                        list={`${provider}-models`}
                        value={String(settings[modelKey] || '')}
                        onChange={(event) => update({ [modelKey]: event.target.value })}
                    />
                    <datalist id={`${provider}-models`}>
                        {models.map((model) => (
                            <option key={model} value={model} />
                        ))}
                    </datalist>
                    <Button onClick={onLoad} disabled={loading}>
                        {loading ? (
                            <LoaderCircle className="spin" size={16} />
                        ) : (
                            <RefreshCw size={16} />
                        )}{' '}
                        Load
                    </Button>
                </div>
            </label>
        </div>
    );
}

function MobileNav({ controller }: { controller: ModernController }) {
    return (
        <nav className="m-bottom-nav" aria-label="Mobile navigation">
            {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                    <button
                        key={item.id}
                        aria-label={item.label}
                        className={controller.data.currentView === item.id ? 'is-active' : ''}
                        onClick={() => controller.setView(item.id)}
                    >
                        <Icon size={20} />
                        <span>{item.label}</span>
                    </button>
                );
            })}
        </nav>
    );
}

export function ModernApp({ user }: { user: BootstrapUser }) {
    const controller = useModernController(user);
    const [sidebar, setSidebar] = useState(false);
    const [settings, setSettings] = useState(false);
    return (
        <div className="modern-app">
            <AppSidebar
                controller={controller}
                open={sidebar}
                onClose={() => setSidebar(false)}
                onSettings={() => setSettings(true)}
            />
            <main className="m-main">
                <Topbar
                    controller={controller}
                    onMenu={() => setSidebar(true)}
                    onSettings={() => setSettings(true)}
                />
                <div className="m-content">
                    {controller.data.currentView === 'chat' && <ChatView controller={controller} />}
                    {controller.data.currentView === 'characters' && (
                        <CharactersView controller={controller} />
                    )}
                    {controller.data.currentView === 'generator' && (
                        <GeneratorView controller={controller} />
                    )}
                    {controller.data.currentView === 'gallery' && (
                        <GalleryView controller={controller} />
                    )}
                    {controller.data.currentView === 'stats' && (
                        <StatsView controller={controller} />
                    )}
                </div>
            </main>
            <MobileNav controller={controller} />
            {settings && (
                <SettingsPanel controller={controller} onClose={() => setSettings(false)} />
            )}
            <Toasts controller={controller} />
        </div>
    );
}
