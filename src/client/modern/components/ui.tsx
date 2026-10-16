import { X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function Button({
    children,
    variant = 'secondary',
    className = '',
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
    return (
        <button className={`m-button m-button--${variant} ${className}`} {...props}>
            {children}
        </button>
    );
}

export function IconButton({
    label,
    children,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
    return (
        <button className="m-icon-button" aria-label={label} title={label} {...props}>
            {children}
        </button>
    );
}

export function Modal({
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
    const dialogRef = useRef<HTMLElement>(null);
    useEffect(() => {
        const handler = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);
    // Focus moves into the dialog when it opens, so keyboard and screen reader users land in it,
    // and returns to whatever opened it when it closes.
    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;
        const dialog = dialogRef.current;
        if (dialog && !dialog.contains(document.activeElement)) {
            const field = dialog.querySelector<HTMLElement>(
                '.m-modal__body input:not([type="hidden"]):not([disabled]), .m-modal__body textarea:not([disabled]), .m-modal__body select:not([disabled])'
            );
            (field || dialog).focus();
        }
        return () => {
            if (opener?.isConnected) opener.focus();
        };
    }, []);
    return (
        <div
            className="m-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
            <section
                ref={dialogRef}
                tabIndex={-1}
                className={`m-modal m-modal--${size}`}
                role="dialog"
                aria-modal="true"
                aria-label={title}
            >
                <header className="m-modal__header">
                    <div>
                        <span className="m-eyebrow">Wink Studio</span>
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
