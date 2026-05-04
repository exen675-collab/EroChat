import { FormEvent, StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import './tailwind.css';
import '../../css/styles.css';

type AuthMessage = {
    text: string;
    isError: boolean;
};

async function postAuth(url: string, payload: { username: string; password: string }) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || 'Request failed.');
    }
    return data;
}

function AuthPanel({
    title,
    description,
    accent,
    submitLabel,
    endpoint,
    onMessage
}: {
    title: string;
    description: string;
    accent: 'pink' | 'cyan';
    submitLabel: string;
    endpoint: string;
    onMessage: (message: AuthMessage) => void;
}) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const username = String(formData.get('username') || '').trim();
        const password = String(formData.get('password') || '');

        setIsSubmitting(true);
        try {
            await postAuth(endpoint, { username, password });
            window.location.href = '/app/';
        } catch (error) {
            onMessage({
                text: error instanceof Error ? error.message : 'Request failed.',
                isError: true
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    const titleClass = accent === 'pink' ? 'text-pink-400' : 'text-cyan-400';
    const focusClass = accent === 'pink' ? 'focus:border-pink-500' : 'focus:border-cyan-500';
    const buttonClass =
        accent === 'pink' ? 'bg-pink-600 hover:bg-pink-500' : 'bg-cyan-600 hover:bg-cyan-500';

    return (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h1 className={`mb-2 text-2xl font-bold ${titleClass}`}>{title}</h1>
            <p className="mb-6 text-sm text-slate-400">{description}</p>

            <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                    <label className="mb-1 block text-sm text-slate-300">
                        Username
                        <input
                            name="username"
                            type="text"
                            required
                            className={`mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none ${focusClass}`}
                        />
                    </label>
                </div>
                <div>
                    <label className="mb-1 block text-sm text-slate-300">
                        Password
                        <input
                            name="password"
                            type="password"
                            required
                            className={`mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none ${focusClass}`}
                        />
                    </label>
                </div>
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`w-full rounded-lg py-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${buttonClass}`}
                >
                    {isSubmitting ? 'Please wait...' : submitLabel}
                </button>
            </form>
        </section>
    );
}

function LoginApp() {
    const [message, setMessage] = useState<AuthMessage | null>(null);

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
            <div className="grid w-full max-w-5xl gap-6 md:grid-cols-2">
                <AuthPanel
                    title="Log In"
                    description="Use your username and password."
                    accent="pink"
                    submitLabel="Log In"
                    endpoint="/api/auth/login"
                    onMessage={setMessage}
                />
                <AuthPanel
                    title="Create Account"
                    description="Username: 3-24 chars, letters/numbers/_/-. Password: 6+ chars."
                    accent="cyan"
                    submitLabel="Create Account"
                    endpoint="/api/auth/signup"
                    onMessage={setMessage}
                />
            </div>

            {message ? (
                <div
                    className={`fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg border bg-slate-900 px-4 py-2 text-sm ${
                        message.isError
                            ? 'border-red-700 text-red-300'
                            : 'border-green-700 text-green-300'
                    }`}
                >
                    {message.text}
                </div>
            ) : null}
        </main>
    );
}

createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
        <LoginApp />
    </StrictMode>
);
