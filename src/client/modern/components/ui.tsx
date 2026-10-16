import { X } from 'lucide-react';
import {
    useEffect,
    useRef,
    type ButtonHTMLAttributes,
    type ReactNode,
    type RefObject
} from 'react';

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

/**
 * Shared dialog behavior: Escape closes it, focus moves into it on open (to the first field inside
 * `fieldScope`, or the dialog itself) and returns to whatever opened it on close.
 */
export function useDialog(
    dialogRef: RefObject<HTMLElement | null>,
    onClose: () => void,
    fieldScope?: string
) {
    useEffect(() => {
        const handler = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);
    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;
        const dialog = dialogRef.current;
        if (dialog && !dialog.contains(document.activeElement)) {
            const field = fieldScope
                ? dialog.querySelector<HTMLElement>(
                      ['input:not([type="hidden"])', 'textarea', 'select']
                          .map((selector) => `${fieldScope} ${selector}:not([disabled])`)
                          .join(', ')
                  )
                : null;
            (field || dialog).focus();
        }
        return () => {
            if (opener?.isConnected) opener.focus();
        };
    }, []);
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
    useDialog(dialogRef, onClose, '.m-modal__body');
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
