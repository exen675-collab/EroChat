import type { ReactNode } from 'react';

export function SettingsSection({
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
