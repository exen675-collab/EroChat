import { X } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';

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
