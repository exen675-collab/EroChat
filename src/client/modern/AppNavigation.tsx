import {
    Activity,
    CircleUserRound,
    Compass,
    GalleryHorizontalEnd,
    LogOut,
    Menu,
    MessageCircle,
    MoreHorizontal,
    Settings,
    Users,
    WandSparkles,
    Zap
} from 'lucide-react';
import { logout } from './api.js';
import { Avatar } from './components/character-visuals.js';
import { IconButton } from './components/ui.js';
import type { ViewId } from './types.js';
import type { ModernController } from './useModernController.js';

const NAV_ITEMS: Array<{ id: ViewId; label: string; icon: typeof MessageCircle }> = [
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'characters', label: 'Characters', icon: Users },
    { id: 'browse', label: 'Browse', icon: Compass },
    { id: 'generator', label: 'Create', icon: WandSparkles },
    { id: 'gallery', label: 'Gallery', icon: GalleryHorizontalEnd },
    { id: 'stats', label: 'Insights', icon: Activity }
];

export function AppSidebar({
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

export function Topbar({
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
        browse: ['Community', 'Character Browse'],
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

export function MobileNav({ controller }: { controller: ModernController }) {
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
