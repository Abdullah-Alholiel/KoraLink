'use client';

/**
 * Uppercase micro-label that opens each flat section of the redesigned
 * profile screen (sketches/004-profile-redesign V2). Shared by the page
 * and EmailSection so labels stay pixel-identical.
 */
export default function FlatSectionLabel({ label }: { label: string }) {
    return (
        <p className="px-6 pt-6 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {label}
        </p>
    );
}
