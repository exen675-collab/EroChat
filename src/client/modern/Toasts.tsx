import { X } from 'lucide-react';
import type { ModernController } from './useModernController.js';

export function Toasts({ controller }: { controller: ModernController }) {
    return (
        <div className="m-toasts" aria-live="polite">
            {controller.notices.map((notice) => (
                <button
                    key={notice.id}
                    className={`m-toast m-toast--${notice.type}`}
                    onClick={() => controller.dismissNotice(notice.id)}
                >
                    <span>{notice.message}</span>
                    <X size={16} />
                </button>
            ))}
        </div>
    );
}
