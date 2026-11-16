'use client';

/**
 * MenuItem — the profile-family flat menu row (sketches/004-profile-redesign V2).
 *
 * Extracted from `src/app/[locale]/(main)/profile/page.tsx` in run #104 (P2-133)
 * so the Settings hub and the profile page share ONE row component instead of
 * duplicating markup (Reviewer A IMPORTANT: the 775-line profile page must
 * extract, not extend). Exact move: same props, classes, and render logic as the
 * donor's inline definition — behavior identical.
 *
 * Rows are borderless; hairline separators come from the parent via sibling
 * selectors (`h-px bg-gray-100` divs between rows). Rows carry generous 44pt+
 * tap height (px-6 py-3.5).
 */

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface MenuItemProps {
    icon: React.ReactNode;
    label: string;
    endText?: string;
    danger?: boolean;
    href?: string;
    onClick?: () => void;
}

function MenuItem({ icon, label, endText, danger, href, onClick }: MenuItemProps) {
    const content = (
        <>
            <div className={`w-5 h-5 flex-shrink-0 ${danger ? 'text-brand-red' : 'text-brand-green'}`}>
                {icon}
            </div>
            <span
                className={`flex-1 text-start text-sm font-medium ${
                    danger ? 'text-brand-red' : 'text-brand-black'
                }`}
            >
                {label}
            </span>
            {endText && (
                <span className="text-sm font-semibold text-gray-500" dir="ltr">
                    {endText}
                </span>
            )}
            {!danger && (
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 rtl:rotate-180" strokeWidth={1.5} />
            )}
        </>
    );

    const className =
        'w-full flex items-center gap-3.5 px-6 py-3.5 hover:bg-gray-50 transition-colors';

    if (href) {
        return (
            <Link href={href} className={className}>
                {content}
            </Link>
        );
    }

    return (
        <button onClick={onClick} className={className}>
            {content}
        </button>
    );
}

export default MenuItem;
