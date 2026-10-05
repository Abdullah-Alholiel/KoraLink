'use client';

/**
 * Settings hub (P2-133, run #104) — one discoverable surface that LINKS every
 * preference previously buried mid-way down the 775-line profile page:
 * push notification settings, language, email prefs, PDPL data rights,
 * privacy/terms, and sign-out.
 *
 * Design rules (Reviewer A/B run #104 + koralink-ui-standards):
 * - The hub LINKS, never duplicates state: push toggles/quiet hours, the PDPL
 *   sheets and the sign-out confirm sheet stay owned by the profile page
 *   (deep-link anchors `#notifications` / `#account` land on the right block).
 * - No own chrome: the (main) layout provides MobileFrame/BottomNav.
 * - MenuItem is the shared row component (extracted from profile in this run).
 * - Every string is i18n-keyed (EN+AR); no Date/navigator on the render path
 *   (hydration-safe: static links + the locale toggle only).
 */

import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
    AlertTriangle,
    ArrowLeft,
    BellRing,
    BookOpen,
    Download,
    FileText,
    Globe,
    LogOut,
    Shield,
} from 'lucide-react';
import MenuItem from '@/components/profile/MenuItem';
import FlatSectionLabel from '@/components/profile/FlatSectionLabel';
import EmailSection from '@/components/profile/EmailSection';
import LanguageToggle from '@/components/common/LanguageToggle';
import OfflineBanner from '@/components/layout/OfflineBanner';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export default function SettingsPage() {
    const router = useRouter();
    const t = useTranslations();
    // PR-Agent r1 (run #104): use the framework locale, not hand-parsed
    // pathname — route-shape changes can't silently break link locales.
    const locale = useLocale();
    // Same offline signal pattern as the profile page (P2-63 convention).
    const isOnline = useOnlineStatus();

    const profilePath = `/${locale}/profile`;

    return (
        <div className="pb-4">
            {/* P2-63 convention: shared offline banner on every (main) surface. */}
            <OfflineBanner isOffline={!isOnline} className="mx-4 mt-2" />

            {/* Standard pinned white header (personal-info pattern):
                back + centered title. */}
            <div className="sticky top-0 z-40 flex items-center bg-white px-4 pt-[var(--top-safe-inset)] pb-2 shadow-[0_4px_14px_rgba(0,0,0,0.07)] border-b border-gray-100">
                <button
                    onClick={() => router.back()}
                    className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-50"
                    aria-label={t('common.back')}
                >
                    <ArrowLeft className="h-5 w-5 text-brand-black rtl:-scale-x-100" strokeWidth={2} />
                </button>
                <h1 className="absolute start-1/2 -translate-x-1/2 rtl:translate-x-1/2 text-base font-bold text-brand-black">
                    {t('settings.title')}
                </h1>
            </div>

            {/* ── NOTIFICATIONS ─────────────────────────────────────────── */}
            <FlatSectionLabel label={t('settings.sectionNotifications')} />
            <div>
                <MenuItem
                    icon={<BellRing className="h-5 w-5" strokeWidth={1.5} />}
                    label={t('settings.notifications')}
                    href={`${profilePath}#notifications`}
                />
                <div className="h-px bg-gray-100 ms-[60px]" />
                <MenuItem
                    icon={<BookOpen className="h-5 w-5" strokeWidth={1.5} />}
                    label={t('settings.hostGuide')}
                    href={`/${locale}/host-guide`}
                />
            </div>

            {/* ── EMAIL (EmailSection renders its own section label) ────── */}
            <EmailSection />

            {/* ── MY DATA (PDPL: neutral context away from stats/wallet) ── */}
            <FlatSectionLabel label={t('settings.sectionData')} />
            <div>
                <p role="note" className="px-6 py-2 text-xs leading-5 text-gray-500">
                    {t('settings.dataNote')}
                </p>
                <MenuItem
                    icon={<Download className="h-5 w-5" strokeWidth={1.5} />}
                    label={t('profile.exportData')}
                    href={`${profilePath}#account`}
                />
                <div className="h-px bg-gray-100 ms-[60px]" />
                <MenuItem
                    icon={<AlertTriangle className="h-5 w-5" strokeWidth={1.5} />}
                    label={t('profile.deleteAccount.menu')}
                    danger
                    href={`${profilePath}#account`}
                />
            </div>

            {/* ── PRIVACY & LEGAL ───────────────────────────────────────── */}
            <FlatSectionLabel label={t('settings.sectionLegal')} />
            <div>
                <MenuItem
                    icon={<Shield className="h-5 w-5" strokeWidth={1.5} />}
                    label={t('profile.privacyPolicy')}
                    href={`/${locale}/privacy`}
                />
                <div className="h-px bg-gray-100 ms-[60px]" />
                <MenuItem
                    icon={<FileText className="h-5 w-5" strokeWidth={1.5} />}
                    label={t('profile.termsOfService')}
                    href={`/${locale}/terms`}
                />
            </div>

            {/* ── ACCOUNT ───────────────────────────────────────────────── */}
            <FlatSectionLabel label={t('settings.sectionAccount')} />
            <div>
                {/* Language row — mirrors the profile page's pressed-state
                    ع/EN toggle (choice visible before pressing). */}
                <div className="w-full flex items-center gap-3.5 px-6 py-2">
                    <div className="w-5 h-5 flex-shrink-0 text-brand-green">
                        <Globe className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <span className="flex-1 text-start text-sm font-medium text-brand-black">
                        {t('settings.language')}
                    </span>
                    <LanguageToggle size="md" ariaLabel={t('settings.language')} />
                </div>
                <div className="h-px bg-gray-100 ms-[60px]" />
                {/* Sign-out LINK: the confirm sheet lives on the profile page
                    (anchor #account) — the hub never duplicates destructive
                    flows (Reviewer B: linked sub-surfaces, not flattened). */}
                <MenuItem
                    icon={<LogOut className="h-5 w-5" strokeWidth={1.5} />}
                    label={t('profile.signOut')}
                    danger
                    href={`${profilePath}#account`}
                />
            </div>
        </div>
    );
}
