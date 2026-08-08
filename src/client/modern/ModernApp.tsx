import { useState } from 'react';
import type { BootstrapUser } from '../auth.js';
import { AppSidebar, MobileNav, Topbar } from './AppNavigation.js';
import { SettingsPanel } from './settings/SettingsPanel.js';
import { Toasts } from './Toasts.js';
import { useModernController } from './useModernController.js';
import { CharacterBrowseView } from './views/CharacterBrowseView.js';
import { CharactersView } from './views/CharactersView.js';
import { ChatView } from './views/ChatView.js';
import { GalleryView } from './views/GalleryView.js';
import { GeneratorView } from './views/GeneratorView.js';
import { StatsView } from './views/StatsView.js';
import './modern.css';

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
                    {controller.data.currentView === 'browse' && (
                        <CharacterBrowseView controller={controller} />
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
