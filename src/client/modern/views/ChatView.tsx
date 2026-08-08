import {
    Archive,
    Check,
    CircleUserRound,
    Copy,
    Download,
    Edit3,
    GitBranch,
    LoaderCircle,
    RefreshCw,
    Save,
    Send,
    Sparkles,
    Trash2,
    Volume2,
    WandSparkles
} from 'lucide-react';
import {
    useEffect,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent
} from 'react';
import { getAssistantVisibleText } from '../../utils.js';
import { Avatar } from '../components/character-visuals.js';
import { Button, Modal } from '../components/ui.js';
import { parseNarrativeSegments } from '../message-format.js';
import type { ModernMessage } from '../types.js';
import type { ModernController } from '../useModernController.js';

const MIN_COMPOSER_HEIGHT = 100;
const MAX_COMPOSER_HEIGHT = 360;

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

export function ChatView({ controller }: { controller: ModernController }) {
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
