/**
 * EmptyState — the shared "Empty" UX state (UI standards §6.2).
 *
 * Presentational only: the caller passes already-localized copy (this
 * component never imports i18n) and an optional CTA node (Link/button),
 * rendered as-is below the description.
 */

import type { ReactNode } from 'react';
import { MapPin, type LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
}

export default function EmptyState({ icon: Icon = MapPin, title, description, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-20 px-8">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <Icon className="w-10 h-10 text-gray-300" strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-bold text-brand-black mb-1">{title}</h3>
            {description && <p className="text-sm text-gray-400 text-center mb-6">{description}</p>}
            {action}
        </div>
    );
}
