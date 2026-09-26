import {
    Archive,
    ArrowDown,
    ArrowUp,
    Brain,
    Check,
    ChevronDown,
    ChevronLeft,
    CodeXml,
    Copy,
    Cpu,
    Download,
    GitBranch,
    ImagePlus,
    Image as ImageIcon,
    Lightbulb,
    MessageSquareQuote,
    Square,
    LoaderCircle,
    PanelRight,
    Pencil,
    Plus,
    RefreshCw,
    Save,
    Trash2,
    Volume2,
    WandSparkles
} from 'lucide-react';
import {
    Fragment,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent
} from 'react';
import { getAssistantVisibleText } from '../../utils.js';
import { dayKey, formatDayLabel, formatMessageTime } from '../chat-time.js';
import { getCharacterThumbnailUrl } from '../character-thumbnails.js';
import { Portrait } from '../components/character-visuals.js';
import { Button, Modal } from '../components/ui.js';
import { parseNarrativeSegments } from '../message-format.js';
import type { ModernMessage } from '../types.js';
import type { ModernController } from '../useModernController.js';
import { CharacterEditor } from './CharactersView.js';
import { CharacterPanel } from './chat/CharacterPanel.js';
import { ConversationList } from './chat/ConversationList.js';

const PANEL_STORAGE_KEY = 'erochat-chat-panel';
const PANEL_OVERLAY_WIDTH = 1180;
const MIN_COMPOSER_HEIGHT = 38;
const PENDING_MEDIA = ['queued', 'starting', 'loading', 'generating'];
const UPGRADE_MODES = [
    ['minimal', 'Light touch'],
    ['normal', 'Polish'],
    ['full', 'Rewrite']
] as const;

function Prose({ text }: { text: string }) {
    return (
        <>
            {text
                .split('\n')
                .map((line, index) =>
                    line ? (
                        <p key={index}>
                            {parseNarrativeSegments(line).map((segment, segmentIndex) =>
                                segment.narrative ? (
                                    <em key={segmentIndex}>{segment.text}</em>
                                ) : (
                                    <span key={segmentIndex}>{segment.text}</span>
                                )
                            )}
                        </p>
                    ) : null
                )}
        </>
    );
}

function MessageItem({
    message,
    controller,
    isLast,
    canRegenerate,
    onEdit,
    onLightbox
}: {
    message: ModernMessage;
    controller: ModernController;
    isLast: boolean;
    canRegenerate: boolean;
    onEdit: (message: ModernMessage) => void;
    onLightbox: (url: string, video?: boolean) => void;
}) {
    const assistant = message.role === 'assistant';
    const visible = assistant ? getAssistantVisibleText(message.content) : message.content;
    const time = formatMessageTime(message.createdAt);
    const copy = () => {
        void navigator.clipboard
            ?.writeText(getAssistantVisibleText(visible, { preserveActionMarkers: false }))
            .then(() => controller.notify('Copied to clipboard.', 'success'));
    };
    const remove = () =>
        window.confirm('Remove this message from chat history and future context?') &&
        controller.removeMessage(message.id);
    // Touch screens have no hover, so tapping a message reveals its actions.
    const [selected, setSelected] = useState(false);
    const toggleSelected = (event: ReactMouseEvent<HTMLElement>) => {
        if (!(event.target as HTMLElement).closest('button, a')) setSelected((value) => !value);
    };
    const flags = message.editedAt && <span className="m-msg__flag">Edited</span>;

    if (!assistant) {
        return (
            <article
                className={`m-msg m-msg--user ${selected ? 'is-selected' : ''} ${message.archivedFromModelContext ? 'is-archived' : ''}`}
                onClick={toggleSelected}
            >
                <div className="m-bubble">
                    <Prose text={visible} />
                </div>
                <div className="m-msg__meta">
                    {flags}
                    {time && <time>{time}</time>}
                </div>
                <div className="m-msg__actions">
                    <button aria-label="Copy message" title="Copy" onClick={copy}>
                        <Copy size={15} />
                    </button>
                    <button aria-label="Edit message" title="Edit" onClick={() => onEdit(message)}>
                        <Pencil size={15} />
                    </button>
                    <button
                        aria-label="Branch from here"
                        title="Branch from here"
                        onClick={() => controller.branchFromMessage(message.id)}
                    >
                        <GitBranch size={15} />
                    </button>
                    <button aria-label="Remove message" title="Remove" onClick={remove}>
                        <Trash2 size={15} />
                    </button>
                </div>
            </article>
        );
    }

    const mediaPending = PENDING_MEDIA.includes(message.mediaStatus || '');
    return (
        <article
            className={`m-msg m-msg--ai ${isLast ? 'is-last' : ''} ${selected ? 'is-selected' : ''} ${message.archivedFromModelContext ? 'is-archived' : ''}`}
            aria-busy={message.isStreaming || undefined}
            onClick={toggleSelected}
        >
            <div className="m-msg__who">
                <Portrait
                    character={controller.currentCharacter}
                    galleryImages={controller.thumbnailImages}
                    size={26}
                />
                <strong>{controller.currentCharacter?.name}</strong>
                {time && <time>{time}</time>}
                {flags}
            </div>
            <div className="m-prose">
                <Prose text={visible} />
                {message.isStreaming && <span className="m-caret" />}
            </div>
            {!message.imageUrl && !message.videoUrl && mediaPending && (
                <div className="m-scene m-scene--pending" role="status">
                    <LoaderCircle className="spin" size={18} /> Scene {message.mediaStatus}…
                </div>
            )}
            {message.mediaStatus === 'failed' && !message.imageUrl && (
                <div className="m-scene-error" role="status">
                    Media failed: {message.mediaError || 'Unknown error'}
                </div>
            )}
            {message.imageUrl && (
                <button
                    className="m-scene"
                    aria-label="Open scene image"
                    onClick={() => onLightbox(message.imageUrl!)}
                >
                    <img src={message.imageUrl} alt="Generated scene" loading="lazy" />
                    <span className="m-scene__tag">
                        <ImageIcon size={12} /> Scene
                    </span>
                </button>
            )}
            {message.videoUrl && (
                <button
                    className="m-scene"
                    aria-label="Open scene video"
                    onClick={() => onLightbox(message.videoUrl!, true)}
                >
                    <video src={message.videoUrl} muted playsInline />
                </button>
            )}
            {!message.isStreaming && (
                <div className="m-msg__actions">
                    {canRegenerate && (
                        <>
                            <button
                                className="m-msg__regen"
                                onClick={() => void controller.regenerateReply()}
                            >
                                <RefreshCw size={15} /> Regenerate
                            </button>
                            <span className="m-msg__sep" />
                        </>
                    )}
                    <button
                        aria-label="Read aloud"
                        title="Read aloud"
                        onClick={() => void controller.playTts(message)}
                    >
                        <Volume2 size={15} />
                    </button>
                    <button aria-label="Copy message" title="Copy" onClick={copy}>
                        <Copy size={15} />
                    </button>
                    <button aria-label="Edit message" title="Edit" onClick={() => onEdit(message)}>
                        <Pencil size={15} />
                    </button>
                    <button
                        aria-label="Regenerate scene image"
                        title={message.imageUrl ? 'Regenerate scene image' : 'Generate scene image'}
                        disabled={Boolean(controller.busy) || mediaPending}
                        onClick={() => void controller.regenerateMessageImage(message.id)}
                    >
                        <ImagePlus size={15} />
                    </button>
                    <button
                        aria-label="Branch from here"
                        title="Branch from here"
                        onClick={() => controller.branchFromMessage(message.id)}
                    >
                        <GitBranch size={15} />
                    </button>
                    <button aria-label="Remove message" title="Remove" onClick={remove}>
                        <Trash2 size={15} />
                    </button>
                </div>
            )}
        </article>
    );
}

function MemoryNotice({ controller }: { controller: ModernController }) {
    const [text, setText] = useState(controller.memoryDraft?.text || '');
    useEffect(() => {
        setText(controller.memoryDraft?.text || '');
    }, [controller.memoryDraft]);
    const active = controller.messages.filter(
        (message) => !message.archivedFromModelContext
    ).length;
    const limit =
        controller.currentCharacter?.contextMessageCount ||
        controller.data.settings.contextMessageCount;
    const pressure = active >= limit * 2;
    if (!pressure && !controller.memoryDraft) return null;
    return (
        <section className={`m-memory ${pressure ? 'is-warning' : ''}`}>
            {pressure && !controller.memoryDraft && (
                <div className="m-memory__decision">
                    <div>
                        <strong>Memory review required</strong>
                        <p>Compress the oldest context block or raise this chat’s limit.</p>
                    </div>
                    <div>
                        <Button
                            onClick={() => void controller.compressMemory()}
                            disabled={Boolean(controller.busy)}
                        >
                            {controller.busy === 'memory' ? (
                                <LoaderCircle className="spin" size={16} />
                            ) : (
                                <Archive size={16} />
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
                            <Check size={16} /> Accept
                        </Button>
                        <Button onClick={() => void controller.compressMemory()}>
                            <RefreshCw size={16} /> Regenerate
                        </Button>
                        <Button onClick={() => controller.setMemoryDraft(null)}>Reject</Button>
                    </div>
                </div>
            )}
        </section>
    );
}

/** "anthropic/claude-sonnet-5" → "claude-sonnet-5" */
function shortModelName(model: string) {
    return model.split('/').pop() || model;
}

function ModelChip({ controller }: { controller: ModernController }) {
    const settings = controller.data.settings;
    if (settings.textProvider === 'grok-cli') {
        const label = `Grok · ${settings.grokModel || 'CLI default'}`;
        return (
            <span className="m-model-chip" title={label}>
                <Cpu size={14} />
                <span className="m-model-chip__label">{label}</span>
            </span>
        );
    }
    const models = [
        settings.openrouterModel,
        ...settings.favoriteOpenRouterModels.filter((model) => model !== settings.openrouterModel)
    ].filter(Boolean);
    return (
        <label className="m-model-chip" title={settings.openrouterModel || 'Choose a model'}>
            <Cpu size={14} />
            <span className="m-model-chip__label">
                {settings.openrouterModel ? shortModelName(settings.openrouterModel) : 'Model'}
            </span>
            {models.length > 1 && <ChevronDown size={14} />}
            <select
                aria-label="Quick model"
                value={settings.openrouterModel}
                disabled={models.length < 2}
                onChange={(event) =>
                    controller.updateSettings({ openrouterModel: event.target.value })
                }
            >
                {models.length === 0 && <option value="">Choose a model in Settings</option>}
                {models.map((model) => (
                    <option key={model} value={model}>
                        {model}
                    </option>
                ))}
            </select>
        </label>
    );
}

function ChatPane({
    controller,
    panelOpen,
    onTogglePanel,
    onBack,
    onLightbox
}: {
    controller: ModernController;
    panelOpen: boolean;
    onTogglePanel: () => void;
    onBack: () => void;
    onLightbox: (url: string, video?: boolean) => void;
}) {
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const characterId = controller.currentCharacter?.id || '';
    const draft = drafts[characterId] || '';
    const setDraft = (value: string) =>
        setDrafts((current) => ({ ...current, [characterId]: value }));
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [preview, setPreview] = useState<any>(null);
    const [editing, setEditing] = useState<ModernMessage | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [showJump, setShowJump] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const streamRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const followBottom = useRef(true);
    const lastScrollTop = useRef(0);
    const character = controller.currentCharacter;
    const messages = controller.messages;
    const maxComposerHeight = Math.max(
        MIN_COMPOSER_HEIGHT,
        controller.data.settings.messageInputHeight || 192
    );

    const scrollToBottom = () => {
        const stream = streamRef.current;
        if (!stream) return;
        stream.scrollTop = stream.scrollHeight;
        lastScrollTop.current = stream.scrollTop;
    };
    useLayoutEffect(() => {
        followBottom.current = true;
        setShowJump(false);
        setSuggestions([]);
        setShowArchived(false);
        scrollToBottom();
    }, [character?.id]);
    useLayoutEffect(() => {
        if (followBottom.current) scrollToBottom();
        else setShowJump(true);
    }, [messages, controller.busy]);
    useEffect(() => {
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => {
            if (followBottom.current) scrollToBottom();
        });
        if (streamRef.current) observer.observe(streamRef.current);
        if (contentRef.current) observer.observe(contentRef.current);
        return () => observer.disconnect();
    }, []);
    useLayoutEffect(() => {
        const input = inputRef.current;
        if (!input) return;
        input.style.height = 'auto';
        input.style.height = `${Math.min(Math.max(input.scrollHeight, MIN_COMPOSER_HEIGHT), maxComposerHeight)}px`;
    }, [draft, maxComposerHeight]);
    useEffect(() => {
        if (!menuOpen) return;
        const close = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
        };
        const escape = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', escape);
        };
    }, [menuOpen]);

    async function suggest() {
        setMenuOpen(false);
        setSuggestions(await controller.fetchSuggestions());
    }
    useEffect(() => {
        const shortcut = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
                event.preventDefault();
                if (!controller.busy) void suggest();
            }
        };
        document.addEventListener('keydown', shortcut);
        return () => document.removeEventListener('keydown', shortcut);
    });

    async function submit() {
        followBottom.current = true;
        if (!draft.trim() || controller.busy || !controller.currentCharacter) return;
        const pending = controller.sendMessage(draft);
        setDraft('');
        setSuggestions([]);
        await pending;
    }
    async function upgrade(mode: string) {
        setMenuOpen(false);
        setDraft(await controller.upgradeDraft(draft, mode));
        inputRef.current?.focus();
    }

    const active = messages.filter((message) => !message.archivedFromModelContext).length;
    const archivedCount = messages.length - active;
    const shownMessages = showArchived
        ? messages
        : messages.filter((message) => !message.archivedFromModelContext);
    const limit =
        (character?.contextMessageCount || controller.data.settings.contextMessageCount) * 2;
    const memoryCount = character?.memorySnapshots?.length || 0;
    const backdrop = getCharacterThumbnailUrl(character, controller.thumbnailImages);
    const lastAssistantId = [...messages]
        .reverse()
        .find((message) => message.role === 'assistant')?.id;
    const waiting =
        controller.busy === 'chat' &&
        !messages.some((message) => message.isStreaming && Boolean(message.content));
    const chatBusy = controller.busy === 'chat';

    return (
        <section className="m-chat" aria-label={`Chat with ${character?.name || 'character'}`}>
            {backdrop && (
                <div
                    className="m-chat__backdrop"
                    style={{ backgroundImage: `url("${backdrop}")` }}
                />
            )}
            <header className="m-chat__head">
                <button
                    className="m-icon-btn m-chat__back"
                    aria-label="Back to chats"
                    onClick={onBack}
                >
                    <ChevronLeft size={20} />
                </button>
                <Portrait
                    character={character}
                    galleryImages={controller.thumbnailImages}
                    size={36}
                />
                <div className="m-chat__title">
                    <strong>{character?.name}</strong>
                    <span aria-label="Conversation memory status">
                        <Brain size={12} /> {active}/{limit} in context
                        <span className="m-chat__meta-extra">
                            {' '}
                            · {archivedCount} archived · {memoryCount}{' '}
                            {memoryCount === 1 ? 'memory' : 'memories'}
                        </span>
                    </span>
                </div>
                <ModelChip controller={controller} />
                <button
                    className={`m-icon-btn ${panelOpen ? 'is-on' : ''}`}
                    aria-label={panelOpen ? 'Hide character panel' : 'Show character panel'}
                    aria-pressed={panelOpen}
                    title="Character panel"
                    onClick={onTogglePanel}
                >
                    <PanelRight size={18} strokeWidth={1.75} />
                </button>
            </header>
            <div
                className="m-chat__stream"
                ref={streamRef}
                onScroll={() => {
                    const stream = streamRef.current;
                    if (!stream) return;
                    const near = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 120;
                    // Content growing under a programmatic scroll must not count as the user
                    // leaving the bottom — only an upward scroll does.
                    if (near) {
                        followBottom.current = true;
                        setShowJump(false);
                    } else if (stream.scrollTop < lastScrollTop.current - 2) {
                        followBottom.current = false;
                    }
                    lastScrollTop.current = stream.scrollTop;
                }}
                onLoadCapture={() => {
                    if (followBottom.current) scrollToBottom();
                }}
            >
                <div className="m-chat__inner" ref={contentRef}>
                    {messages.length === 0 && (
                        <div className="m-chat-empty">
                            <Portrait
                                character={character}
                                galleryImages={controller.thumbnailImages}
                                size={96}
                            />
                            <span className="m-eyebrow">A new scene begins</span>
                            <h2>Start a conversation with {character?.name}</h2>
                            {character?.greeting?.trim() ? (
                                <blockquote className="m-chat-empty__greeting">
                                    <Prose text={character.greeting.trim()} />
                                </blockquote>
                            ) : (
                                <p>
                                    {character?.description?.trim() ||
                                        'Write the opening line, or ask for a few ideas to set the scene.'}
                                </p>
                            )}
                            <div className="m-chat-empty__actions">
                                {character?.greeting?.trim() && (
                                    <button
                                        className="m-btn m-btn--accent"
                                        onClick={controller.startWithGreeting}
                                    >
                                        <MessageSquareQuote size={15} /> Start with greeting
                                    </button>
                                )}
                                <button
                                    className="m-btn"
                                    disabled={Boolean(controller.busy)}
                                    onClick={() => void suggest()}
                                >
                                    {controller.busy === 'suggestions' ? (
                                        <LoaderCircle className="spin" size={15} />
                                    ) : (
                                        <Lightbulb size={15} />
                                    )}{' '}
                                    Suggest an opener
                                </button>
                            </div>
                        </div>
                    )}
                    {archivedCount > 0 && (
                        <button
                            className="m-archive-toggle"
                            aria-expanded={showArchived}
                            onClick={() => setShowArchived((value) => !value)}
                        >
                            <Archive size={15} />
                            <span>
                                {showArchived
                                    ? `Hide ${archivedCount} earlier ${archivedCount === 1 ? 'message' : 'messages'}`
                                    : `${archivedCount} earlier ${archivedCount === 1 ? 'message is' : 'messages are'} summarized in memory`}
                            </span>
                            <ChevronDown size={15} />
                        </button>
                    )}
                    {shownMessages.map((message, index) => {
                        if (message.isStreaming && !message.content) return null;
                        const previous = shownMessages[index - 1];
                        const day = dayKey(message.createdAt);
                        const showDay = day && day !== dayKey(previous?.createdAt);
                        const memoryEdge =
                            previous?.archivedFromModelContext && !message.archivedFromModelContext;
                        return (
                            <Fragment key={message.id}>
                                {memoryEdge && (
                                    <div className="m-day m-day--memory">
                                        Earlier messages live in memory
                                    </div>
                                )}
                                {showDay && (
                                    <div className="m-day">{formatDayLabel(message.createdAt)}</div>
                                )}
                                <MessageItem
                                    message={message}
                                    controller={controller}
                                    isLast={message.id === lastAssistantId && !chatBusy}
                                    canRegenerate={
                                        message.id === lastAssistantId &&
                                        messages.at(-1)?.id === message.id &&
                                        messages.some((item) => item.role === 'user') &&
                                        !controller.busy
                                    }
                                    onEdit={setEditing}
                                    onLightbox={onLightbox}
                                />
                            </Fragment>
                        );
                    })}
                    {waiting && (
                        <div className="m-typing" role="status">
                            <Portrait
                                character={character}
                                galleryImages={controller.thumbnailImages}
                                size={26}
                            />
                            <span className="m-dots">
                                <i />
                                <i />
                                <i />
                            </span>
                            {character?.name} is writing…
                        </div>
                    )}
                </div>
            </div>
            <button
                className={`m-jump ${showJump ? 'is-shown' : ''}`}
                tabIndex={showJump ? 0 : -1}
                aria-hidden={!showJump}
                onClick={() => {
                    followBottom.current = true;
                    setShowJump(false);
                    scrollToBottom();
                }}
            >
                <ArrowDown size={15} /> New messages
            </button>
            <div className="m-composer-wrap">
                <MemoryNotice controller={controller} />
                {suggestions.length > 0 && (
                    <div className="m-suggestions">
                        {suggestions.map((suggestion) => (
                            <button
                                key={suggestion}
                                onClick={() => {
                                    setDraft(suggestion);
                                    setSuggestions([]);
                                    inputRef.current?.focus();
                                }}
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                )}
                <div className="m-composer">
                    <div className="m-composer__tools" ref={menuRef}>
                        <button
                            className="m-icon-btn"
                            aria-label="Message tools"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onClick={() => setMenuOpen((open) => !open)}
                        >
                            {controller.busy === 'suggestions' || controller.busy === 'upgrade' ? (
                                <LoaderCircle className="spin" size={18} />
                            ) : (
                                <Plus size={18} />
                            )}
                        </button>
                        {menuOpen && (
                            <div className="m-menu" role="menu">
                                <button
                                    role="menuitem"
                                    disabled={Boolean(controller.busy)}
                                    onClick={() => void suggest()}
                                >
                                    <Lightbulb size={16} /> Suggest replies <small>Ctrl J</small>
                                </button>
                                <span className="m-menu__label">Upgrade my draft</span>
                                {UPGRADE_MODES.map(([mode, label]) => (
                                    <button
                                        key={mode}
                                        role="menuitem"
                                        disabled={!draft.trim() || Boolean(controller.busy)}
                                        onClick={() => void upgrade(mode)}
                                    >
                                        <WandSparkles size={16} /> {label}
                                    </button>
                                ))}
                                <hr />
                                <button
                                    role="menuitem"
                                    disabled={Boolean(controller.busy) || active === 0}
                                    onClick={() => {
                                        setMenuOpen(false);
                                        void controller.compressMemory();
                                    }}
                                >
                                    <Brain size={16} /> Compress memory
                                </button>
                                <button
                                    role="menuitem"
                                    disabled={!draft.trim()}
                                    onClick={() => {
                                        setMenuOpen(false);
                                        setPreview(controller.getRequestPreview(draft));
                                    }}
                                >
                                    <CodeXml size={16} /> Preview request
                                </button>
                            </div>
                        )}
                    </div>
                    <textarea
                        ref={inputRef}
                        rows={1}
                        aria-label="Message"
                        placeholder={`Message ${character?.name || 'your character'}…`}
                        value={draft}
                        style={{ maxHeight: maxComposerHeight }}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (
                                event.key === 'Enter' &&
                                !event.shiftKey &&
                                !event.nativeEvent.isComposing
                            ) {
                                event.preventDefault();
                                void submit();
                            }
                        }}
                    />
                    {chatBusy ? (
                        <button
                            className="m-send is-stop"
                            aria-label="Stop reply"
                            title="Stop reply"
                            onClick={controller.stopReply}
                        >
                            <Square size={14} fill="currentColor" />
                        </button>
                    ) : (
                        <button
                            className="m-send"
                            aria-label="Send"
                            onClick={() => void submit()}
                            disabled={!draft.trim() || Boolean(controller.busy)}
                        >
                            <ArrowUp size={18} />
                        </button>
                    )}
                </div>
                <p className="m-composer-hint">
                    <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · wrap
                    text in *asterisks* for narration
                </p>
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
        </section>
    );
}

function initialPanelOpen(): boolean {
    // On narrower screens the panel overlays the chat, so never open it unprompted.
    if (window.innerWidth <= PANEL_OVERLAY_WIDTH) return false;
    return localStorage.getItem(PANEL_STORAGE_KEY) !== 'closed';
}

export function ChatView({ controller }: { controller: ModernController }) {
    const [panelOpen, setPanelOpen] = useState(initialPanelOpen);
    const [mobileChatOpen, setMobileChatOpen] = useState(true);
    const [editingCharacter, setEditingCharacter] = useState(false);
    const [lightbox, setLightbox] = useState<{ url: string; video?: boolean } | null>(null);
    const togglePanel = (open = !panelOpen) => {
        setPanelOpen(open);
        localStorage.setItem(PANEL_STORAGE_KEY, open ? 'open' : 'closed');
    };
    const openLightbox = (url: string, video?: boolean) => setLightbox({ url, video });

    return (
        <div
            className={`m-chat-layout ${panelOpen ? 'is-panel-open' : ''} ${mobileChatOpen ? 'is-chat-open' : ''}`}
        >
            <ConversationList controller={controller} onOpen={() => setMobileChatOpen(true)} />
            <ChatPane
                controller={controller}
                panelOpen={panelOpen}
                onTogglePanel={() => togglePanel()}
                onBack={() => setMobileChatOpen(false)}
                onLightbox={openLightbox}
            />
            {panelOpen && <div className="m-panel-scrim" onClick={() => togglePanel(false)} />}
            <aside className="m-panel" aria-label="Character details" hidden={!panelOpen}>
                {panelOpen && (
                    <CharacterPanel
                        controller={controller}
                        onClose={() => togglePanel(false)}
                        onEdit={() => setEditingCharacter(true)}
                        onLightbox={openLightbox}
                    />
                )}
            </aside>
            {editingCharacter && controller.currentCharacter && (
                <CharacterEditor
                    controller={controller}
                    character={controller.currentCharacter}
                    onClose={() => setEditingCharacter(false)}
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
        <Modal
            title={message.role === 'user' ? 'Edit your message' : 'Edit assistant message'}
            onClose={onClose}
        >
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
