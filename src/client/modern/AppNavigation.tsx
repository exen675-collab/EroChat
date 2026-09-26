import {
    Activity,
    CircleUserRound,
    Compass,
    GalleryHorizontalEnd,
    LogOut,
    MessagesSquare,
    Settings2,
    Users,
    WandSparkles,
    Zap
} from 'lucide-react';
import { logout } from './api.js';
import type { ViewId } from './types.js';
import type { ModernController } from './useModernController.js';

const NAV_ITEMS: Array<{ id: ViewId; label: string; icon: typeof MessagesSquare }> = [
    { id: 'chat', label: 'Chat', icon: MessagesSquare },
    { id: 'characters', label: 'Characters', icon: Users },
    { id: 'browse', label: 'Browse', icon: Compass },
    { id: 'generator', label: 'Create', icon: WandSparkles },
    { id: 'gallery', label: 'Gallery', icon: GalleryHorizontalEnd },
    { id: 'stats', label: 'Insights', icon: Activity }
];

export function AppRail({
    controller,
    onSettings
}: {
    controller: ModernController;
    onSettings: () => void;
}) {
    return (
        <nav className="m-rail" aria-label="Main navigation">
            <span className="m-rail__logo">
                <img src="/favicon.png" alt="EroChat" />
            </span>
            {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                    <button
                        key={item.id}
                        aria-label={item.label}
                        data-tip={item.label}
                        className={controller.data.currentView === item.id ? 'is-active' : ''}
                        onClick={() => controller.setView(item.id)}
                    >
                        <Icon size={19} strokeWidth={1.75} />
                    </button>
                );
            })}
            <span className="m-rail__spacer" />
            <span
                className="m-rail__credits"
                title={`${controller.user.credits} credits`}
                aria-label={`${controller.user.credits} credits`}
            >
                <Zap size={13} />
                {controller.user.credits}
            </span>
            <button aria-label="Settings" data-tip="Settings" onClick={onSettings}>
                <Settings2 size={19} strokeWidth={1.75} />
            </button>
            <button aria-label="Log out" data-tip="Log out" onClick={() => void logout()}>
                <LogOut size={19} strokeWidth={1.75} />
            </button>
            <button
                className="m-rail__me"
                aria-label={`Profile @${controller.user.username}`}
                data-tip={`@${controller.user.username}`}
                onClick={onSettings}
            >
                {controller.user.username.slice(0, 1).toUpperCase()}
            </button>
        </nav>
    );
}

export function MobileNav({
    controller,
    onSettings
}: {
    controller: ModernController;
    onSettings: () => void;
}) {
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
                        <Icon size={20} strokeWidth={1.75} />
                        <span>{item.label}</span>
                    </button>
                );
            })}
            <button aria-label="Profile" onClick={onSettings}>
                <CircleUserRound size={20} strokeWidth={1.75} />
                <span>You</span>
            </button>
        </nav>
    );
}
