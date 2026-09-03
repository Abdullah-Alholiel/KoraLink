'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
    User,
    Wallet,
    Trophy,
    LogOut,
    Globe,
    Headphones,
    Shield,
    FileText,
    ChevronRight,
    Camera,
    Bell,
    BellOff,
    Calendar,
    MessageCircle,
    Tag,
    Moon,
    Flag,
    Download,
    AlertTriangle,
} from 'lucide-react';
import { selectUser, selectIsAuth, useAppStore } from '@/store/useAppStore';
import { useUserStats, useUserProfile, useUpdatePushPreferences, useSoftDeleteAccount, useExportMyData, type PushPreferences, type PushPreferencesInput } from '@/hooks/useUser';
import { useWalletBalance } from '@/hooks/useWallet';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { clearAuthToken } from '@/lib/fetcher';
import { downloadJsonAsFile } from '@/lib/download';
import SignOutConfirmSheet from '@/components/profile/SignOutConfirmSheet';
import DeleteAccountSheet from '@/components/profile/DeleteAccountSheet';
import RestoreAccountBanner from '@/components/profile/RestoreAccountBanner';

interface MenuItemProps {
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
            <div className={`w-5 h-5 flex-shrink-0 ${danger ? 'text-brand-red' : 'text-gray-400'}`}>
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
            {!danger && <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" strokeWidth={1.5} />}
        </>
    );

    const className =
        'w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors';

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

export default function ProfilePage() {
    const pathname = usePathname();
    const router = useRouter();
    const t = useTranslations();
    const locale = (pathname ?? '').split('/')[1] || 'en';

    // Guard against hydration mismatch — browser-only APIs (Push) differ
    // between server and client, causing DOM tree divergence.
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // P0.5 (run #28): show a one-line hint when the user taps "subscribe"
    // but the PWA isn't installed (iOS contract — push only works in
    // installed mode). Cleared when the next attempt is made.
    const [installHintShown, setInstallHintShown] = useState(false);

    // P0-6 (run #29): PDPL sheet state. Both sheets sit idle until the
    // user taps the corresponding MenuItem. signOutPending and
    // deletePending are tracked separately so the buttons' spinners
    // show only for the in-flight action.
    const [signOutSheetOpen, setSignOutSheetOpen] = useState(false);
    const [signOutPending, setSignOutPending] = useState(false);
    const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [exportPending, setExportPending] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);

    // P0-6 (run #29): when a soft-delete completes, the localStorage
    // entry carries the scheduled-purge date so the Restore banner can
    // re-render on a return visit. We read it on mount + after delete.
    const [purgeAt, setPurgeAt] = useState<string | null>(null);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        setPurgeAt(localStorage.getItem('koralink_pdpl_purge_at'));
    }, [deleteSheetOpen]);

    const softDelete = useSoftDeleteAccount();
    const exportData = useExportMyData();

    // ── User data from Zustand store (populated by auth flow) ──
    const storeUser = useAppStore(selectUser);
    const isAuthenticated = useAppStore(selectIsAuth);
    const logout = useAppStore((s) => s.logout);

    // ── Real data from API (fills gaps when store is stale after dev-login) ──
    // P2-26: userStatsError drives the error state (profile still renders with
    // defaults on transient failures — only a hard failure of the stats read,
    // the lightest authenticated call, shows the retry surface; refetch covers
    // every stale query at once).
    const { data: apiUser } = useUserProfile();
    const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useUserStats();
    // Live balance from API. P0-6 (run #29): previously silently fell
    // back to `0` on error — a materially wrong number with no
    // affordance. Now show a localized error line + a "—" balance so
    // the user knows the number is unavailable (vs. a real zero).
    const { data: walletData, error: walletError, refetch: refetchWallet } = useWalletBalance();
    const walletErrorMsg = walletError
        ? (walletError.status === 0
            ? t('common.offline')
            : t('common.error'))
        : null;
    const displayBalance = walletData?.balance ?? (walletErrorMsg ? null : 0);
    const {
        isSubscribed, isSubscribing, isSupported,
        subscribe, unsubscribe,
    } = usePushNotifications(useLocale());

    // ── Push delivery preferences (P1-20) ──
    const updatePrefs = useUpdatePushPreferences();
    const mutatePrefs = (data: PushPreferencesInput) => updatePrefs.mutate(data);
    const HOURS = Array.from({ length: 24 }, (_, i) => i);
    const profileForPrefs = apiUser as
        | (Partial<PushPreferences> & Record<string, unknown>)
        | undefined;
    const prefs: PushPreferences = {
        push_muted: profileForPrefs?.push_muted ?? false,
        quiet_hours_enabled: profileForPrefs?.quiet_hours_enabled ?? false,
        quiet_start_hour: profileForPrefs?.quiet_start_hour ?? 23,
        quiet_end_hour: profileForPrefs?.quiet_end_hour ?? 7,
        // P0-5 (run #28): per-category mutes. Default to all-false (allowed)
        // so a brand-new user with no prefs in the table sees the right UI.
        category_mutes: {
            match: profileForPrefs?.category_mutes?.match ?? false,
            chat: profileForPrefs?.category_mutes?.chat ?? false,
            promo: profileForPrefs?.category_mutes?.promo ?? false,
            system: profileForPrefs?.category_mutes?.system ?? false,
        },
    };

    // Stable, per-category icon + hint so the UI doesn't repeat the
    // map. The category keys are a closed union; the icons are
    // already imported for adjacent features.
    const CATEGORY_ROWS: {
        key: 'match' | 'chat' | 'promo' | 'system';
        icon: typeof Bell;
        hintKey: string;
    }[] = [
        { key: 'match', icon: Calendar, hintKey: 'profile.push.matchHint' },
        { key: 'chat', icon: MessageCircle, hintKey: 'profile.push.chatHint' },
        { key: 'promo', icon: Tag, hintKey: 'profile.push.promoHint' },
        { key: 'system', icon: Shield, hintKey: 'profile.push.systemHint' },
    ];

    // Merge store + API data. API takes priority when available.
    const fullName = apiUser?.full_name ?? storeUser?.fullName ?? t('profile.guestName');
    const handle = apiUser?.handle ?? storeUser?.handle ?? '@guest';
    const avatarUrl = apiUser?.avatar_url ?? storeUser?.avatarUrl;
    const avatarInitial = fullName.charAt(0).toUpperCase();

    return (
        <div className="pb-4">
            {/* P0-6 (run #29): persistent Restore banner. Shows ABOVE
                everything when the user has a scheduled-purge date in
                localStorage. Hidden when restore succeeds or when the
                user dismisses for the current session. */}
            {purgeAt && (
                <RestoreAccountBanner
                    purgeAt={purgeAt}
                    onRestored={() => setPurgeAt(null)}
                    onDismissed={() => {
                        // session-only dismiss — the localStorage entry
                        // is left intact so a hard refresh re-shows it.
                    }}
                />
            )}

            {/* ── Avatar & Name ─────────────────────── */}
            <div className="flex flex-col items-center pt-[var(--top-safe-inset)] pb-4 bg-white">
                <div className="relative">
                    {avatarUrl ? (
                        <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={avatarUrl}
                                alt={fullName}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    ) : (
                        <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center">
                            <span className="text-2xl font-bold text-gray-400">
                                {avatarInitial}
                            </span>
                        </div>
                    )}
                    <button
                        className="absolute bottom-0 end-0 w-8 h-8 rounded-full bg-brand-green flex items-center justify-center border-2 border-white active:scale-95 transition-transform"
                        aria-label={t('profile.editProfile')}
                        onClick={() => router.push(`/${locale}/personal-info`)}
                    >
                        <Camera className="w-4 h-4 text-white" strokeWidth={2} />
                    </button>
                </div>
                <h1 className="text-xl font-bold text-brand-black mt-3">{fullName}</h1>
                <p className="text-sm text-gray-400 mt-0.5" dir="ltr">{handle}</p>
            </div>

            {/* ── Stats Row ────────────────────────── */}
            {isAuthenticated && (
                <div className="flex justify-around bg-white rounded-2xl mx-4 mt-4 py-4 shadow-card">
                    {/* P2-26: loading / error states (previously zero branches —
                        review run #16). Error offers retry via the stats refetch. */}
                    {statsLoading ? (
                        <>
                            <div className="text-center">
                                <div className="h-8 w-12 bg-gray-200 rounded-full mx-auto animate-pulse" />
                                <div className="h-3 w-16 bg-gray-100 rounded-full mx-auto mt-2 animate-pulse" />
                            </div>
                            <div className="w-px bg-gray-100" />
                            <div className="text-center">
                                <div className="h-8 w-12 bg-gray-200 rounded-full mx-auto animate-pulse" />
                                <div className="h-3 w-16 bg-gray-100 rounded-full mx-auto mt-2 animate-pulse" />
                            </div>
                            <div className="w-px bg-gray-100" />
                            <div className="text-center">
                                <div className="h-8 w-12 bg-gray-200 rounded-full mx-auto animate-pulse" />
                                <div className="h-3 w-16 bg-gray-100 rounded-full mx-auto mt-2 animate-pulse" />
                            </div>
                        </>
                    ) : statsError ? (
                        <div className="flex-1 flex flex-col items-center py-1">
                            <p className="text-sm text-gray-400">{t('common.error')}</p>
                            <button
                                type="button"
                                onClick={() => refetchStats()}
                                className="mt-1 text-xs font-semibold text-brand-green"
                            >
                                {t('common.retry')}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="text-center">
                                <p className="text-2xl font-extrabold text-brand-black">{stats?.games_played ?? 0}</p>
                                <p className="text-xs text-gray-400">{t('profile.gamesPlayed')}</p>
                            </div>
                            <div className="w-px bg-gray-100" />
                            <div className="text-center">
                                <p className="text-2xl font-extrabold text-brand-black flex items-center justify-center gap-1">
                                    <Trophy className="w-4 h-4 text-brand-green" strokeWidth={2} />
                                    <span dir="ltr">{apiUser?.pom_count ?? 0}</span>
                                </p>
                                <p className="text-xs text-gray-400">{t('profile.pomCount')}</p>
                            </div>
                            <div className="w-px bg-gray-100" />
                            <div className="text-center">
                                <p className="text-2xl font-extrabold text-brand-black">{stats?.karma_score ?? 0}</p>
                                <p className="text-xs text-gray-400">{t('profile.karma')}</p>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Main Menu ─────────────────────────── */}
            <div className="bg-white rounded-2xl mx-4 mt-4 overflow-hidden shadow-card">
                <MenuItem
                    icon={<User className="w-5 h-5" strokeWidth={1.5} />}
                    label={t('profile.personalInfo')}
                    href={`/${locale}/personal-info`}
                />
                <div className="h-px bg-gray-50 mx-4" />
                <MenuItem
                    icon={<Wallet className="w-5 h-5" strokeWidth={1.5} />}
                    label={t('profile.wallet')}
                    endText={
                        displayBalance === null
                            ? '—'
                            : `SAR ${displayBalance.toFixed(2)}`
                    }
                    href={walletErrorMsg ? undefined : `/${locale}/wallet`}
                    onClick={walletErrorMsg ? () => refetchWallet() : undefined}
                />
                {walletErrorMsg && (
                    <p role="alert" className="mx-4 -mt-1 mb-2 text-xs text-amber-600">
                        {walletErrorMsg}{' · '}
                        <button
                            type="button"
                            onClick={() => refetchWallet()}
                            className="font-semibold underline"
                        >
                            {t('common.retry')}
                        </button>
                    </p>
                )}
                <div className="h-px bg-gray-50 mx-4" />
                <MenuItem
                    icon={<Trophy className="w-5 h-5" strokeWidth={1.5} />}
                    label={t('profile.myGames')}
                    href={`/${locale}/my-games`}
                />
                <div className="h-px bg-gray-50 mx-4" />
                <MenuItem
                    icon={<Flag className="w-5 h-5" strokeWidth={1.5} />}
                    label={t('profile.myReports')}
                    href={`/${locale}/reports`}
                />
                <div className="h-px bg-gray-50 mx-4" />
                <MenuItem
                    icon={<LogOut className="w-5 h-5" strokeWidth={1.5} />}
                    label={t('profile.signOut')}
                    danger
                    onClick={() => setSignOutSheetOpen(true)}
                />
            </div>

            {/* ── Danger Zone (P0-6, run #29) ────────────── */}
            {/* The Delete + Export actions live in their own card so they're
                visually distinct from the routine sign-out above. Auth-gated
                so a logged-out visitor (Reviewer B P1 #3) can't tap them. */}
            {isAuthenticated && (
                <div className="bg-white rounded-2xl mx-4 mt-3 overflow-hidden shadow-card">
                    <div className="px-4 pt-3 pb-1">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                            {t('profile.dangerZone.title')}
                        </p>
                    </div>
                    <MenuItem
                        icon={<Download className="w-5 h-5" strokeWidth={1.5} />}
                        label={t('profile.exportData')}
                        endText={exportPending ? t('common.loading') : undefined}
                        onClick={async () => {
                            setExportError(null);
                            setExportPending(true);
                            try {
                                const data = await exportData.mutateAsync();
                                const today = new Date().toISOString().slice(0, 10);
                                downloadJsonAsFile(data, `koralink-export-${today}.json`);
                            } catch (e) {
                                setExportError((e as Error).message);
                            } finally {
                                setExportPending(false);
                            }
                        }}
                    />
                    {exportError && (
                        <p role="alert" className="mx-4 mb-2 text-xs text-brand-red">
                            {exportError}
                        </p>
                    )}
                    <div className="h-px bg-gray-50 mx-4" />
                    <MenuItem
                        icon={<AlertTriangle className="w-5 h-5" strokeWidth={1.5} />}
                        label={t('profile.deleteAccount.menu')}
                        danger
                        onClick={() => {
                            setDeleteError(null);
                            setDeleteSheetOpen(true);
                        }}
                    />
                </div>
            )}

            {/* ── Settings ──────────────────────────── */}
            <div className="bg-white rounded-2xl mx-4 mt-3 overflow-hidden shadow-card">
                <MenuItem
                    icon={<Globe className="w-5 h-5" strokeWidth={1.5} />}
                    label={t('profile.language')}
                    endText={locale === 'ar' ? t('profile.languageAr') : t('profile.languageEn')}
                    onClick={() => {
                        const newLocale = locale === 'ar' ? 'en' : 'ar';
                        const newPath = (pathname ?? "").replace(`/${locale}`, `/${newLocale}`);
                        // Full page reload ensures complete server re-render with
                        // fresh i18n messages — router.push() may reuse cached RSC.
                        window.location.href = newPath;
                    }}
                />
                {mounted && isSupported && (
                    <>
                        <div className="h-px bg-gray-50 mx-4" />
                        <MenuItem
                            icon={
                                isSubscribing ? (
                                    <div className="w-5 h-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                                ) : (
                                    <Bell className="w-5 h-5" strokeWidth={1.5} />
                                )
                            }
                            label={t('profile.notifications')}
                            endText={isSubscribed ? t('profile.notificationsOn') : t('profile.notificationsOff')}
                            onClick={() => {
                                if (isSubscribed) {
                                    unsubscribe();
                                    return;
                                }
                                // P0.5 (run #28): wire the install-gate
                                // feedback. `subscribe()` returns false when
                                // the PWA isn't installed (iOS contract) —
                                // surface a one-line hint so the user knows
                                // why nothing happened.
                                setInstallHintShown(false);
                                subscribe().then((ok) => {
                                    if (!ok && !isSubscribed) setInstallHintShown(true);
                                });
                            }}
                        />
                        {mounted && installHintShown && !isSubscribed && (
                            <p
                                role="status"
                                className="mx-4 -mt-1 mb-1 text-xs text-amber-600"
                            >
                                {t('common.installRequired')}
                            </p>
                        )}
                        {mounted && isSubscribed && (
                            <>
                                <div className="h-px bg-gray-50 mx-4" />
                                <MenuItem
                                    icon={<BellOff className="w-5 h-5" strokeWidth={1.5} />}
                                    label={t('profile.pushMute')}
                                    endText={prefs.push_muted ? t('profile.pushOn') : t('profile.pushOff')}
                                    onClick={() =>
                                        mutatePrefs({ pushMuted: !prefs.push_muted })
                                    }
                                />
                                <div className="px-4 py-3">
                                    <button
                                        type="button"
                                        className="flex w-full items-center justify-between"
                                        onClick={() =>
                                            mutatePrefs({
                                                quietHoursEnabled: !prefs.quiet_hours_enabled,
                                            })
                                        }
                                    >
                                        <span className="flex items-center gap-2 text-sm font-medium text-brand-black">
                                            <Moon className="w-5 h-5 text-gray-500" strokeWidth={1.5} />
                                            {t('profile.quietHours')}
                                        </span>
                                        <span
                                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${prefs.quiet_hours_enabled ? 'bg-brand-green' : 'bg-gray-200'}`}
                                            role="switch"
                                            aria-checked={prefs.quiet_hours_enabled}
                                        >
                                            <span
                                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${prefs.quiet_hours_enabled ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5'}`}
                                            />
                                        </span>
                                    </button>
                                    {prefs.quiet_hours_enabled && (
                                        <div className="mt-3">
                                            <div className="flex items-center justify-center gap-3" dir="ltr">
                                                <select
                                                    aria-label={t('profile.quietFrom')}
                                                    value={prefs.quiet_start_hour}
                                                    onChange={(e) =>
                                                        mutatePrefs({ quietStartHour: Number(e.target.value) })
                                                    }
                                                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-brand-black"
                                                >
                                                    {HOURS.map((h) => (
                                                        <option key={h} value={h}>{h}:00</option>
                                                    ))}
                                                </select>
                                                <span className="text-sm text-gray-400">→</span>
                                                <select
                                                    aria-label={t('profile.quietTo')}
                                                    value={prefs.quiet_end_hour}
                                                    onChange={(e) =>
                                                        mutatePrefs({ quietEndHour: Number(e.target.value) })
                                                    }
                                                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-brand-black"
                                                >
                                                    {HOURS.map((h) => (
                                                        <option key={h} value={h}>{h}:00</option>
                                                    ))}
                                                </select>
                                            </div>
                                            {prefs.quiet_start_hour === prefs.quiet_end_hour && (
                                                <p
                                                    role="status"
                                                    className="mt-2 text-center text-xs text-amber-600"
                                                >
                                                    {t('profile.quietEqualWarn')}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* P0.5 (run #28): per-category push
                                        mutes. Each toggle is a partial PATCH
                                        on the API side; absent keys leave
                                        the stored value alone. */}
                                    <div className="h-px bg-gray-50 mx-4" />
                                    <div className="px-4 pt-3 pb-1">
                                        <p className="text-sm font-medium text-brand-black">
                                            {t('profile.push.categoriesHint')}
                                        </p>
                                    </div>
                                    {CATEGORY_ROWS.map(({ key, icon: Icon, hintKey }, idx) => (
                                        <div key={key}>
                                            {idx === 0 && <div className="h-px bg-gray-50 mx-4" />}
                                            <div className="px-4 py-3">
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center justify-between gap-3 text-start"
                                                    onClick={() =>
                                                        mutatePrefs({
                                                            categoryMutes: {
                                                                [key]: !prefs.category_mutes[key],
                                                            },
                                                        })
                                                    }
                                                    aria-pressed={prefs.category_mutes[key]}
                                                >
                                                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-brand-black">
                                                        <Icon
                                                            className="w-5 h-5 text-gray-500 shrink-0"
                                                            strokeWidth={1.5}
                                                        />
                                                        <span className="truncate">
                                                            {t(`profile.push.categories.${key}`)}
                                                        </span>
                                                    </span>
                                                    <span
                                                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${prefs.category_mutes[key] ? 'bg-gray-200' : 'bg-brand-green'}`}
                                                        role="switch"
                                                        aria-checked={!prefs.category_mutes[key]}
                                                    >
                                                        <span
                                                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${prefs.category_mutes[key] ? 'translate-x-0.5 rtl:-translate-x-0.5' : 'translate-x-5 rtl:-translate-x-5'}`}
                                                        />
                                                    </span>
                                                </button>
                                                <p className="mt-1 ps-7 text-xs text-gray-500">
                                                    {t(hintKey)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}
                <div className="h-px bg-gray-50 mx-4" />
                <MenuItem
                    icon={<Headphones className="w-5 h-5" strokeWidth={1.5} />}
                    label={t('profile.contactSupport')}
                    href="mailto:hello@koralink.sa"
                />
            </div>

            {/* ── Legal ─────────────────────────────── */}
            <div className="bg-white rounded-2xl mx-4 mt-3 overflow-hidden shadow-card">
                <MenuItem
                    icon={<Shield className="w-5 h-5" strokeWidth={1.5} />}
                    label={t('profile.privacyPolicy')}
                    href={`/${locale}/privacy`}
                />
                <div className="h-px bg-gray-50 mx-4" />
                <MenuItem
                    icon={<FileText className="w-5 h-5" strokeWidth={1.5} />}
                    label={t('profile.termsOfService')}
                    href={`/${locale}/terms`}
                />
            </div>

            {/* ── Footer ────────────────────────────── */}
            <p className="text-center text-xs text-gray-300 mt-6 pb-2">
                {t('profile.footer')}
            </p>

            {/* ── PDPL Sheets (P0-6, run #29) ───────────── */}
            <SignOutConfirmSheet
                isOpen={signOutSheetOpen}
                onClose={() => setSignOutSheetOpen(false)}
                isPending={signOutPending}
                onConfirm={async () => {
                    setSignOutPending(true);
                    // Brief delay so the spinner is visible; the action
                    // itself is local (Zustand clear + cookie clear +
                    // navigate). A future run could add a tracking call.
                    await new Promise((r) => setTimeout(r, 200));
                    logout();
                    clearAuthToken();
                    setSignOutSheetOpen(false);
                    window.location.href = `/${locale}/login`;
                }}
            />
            <DeleteAccountSheet
                isOpen={deleteSheetOpen}
                onClose={() => {
                    if (softDelete.isPending) return;
                    setDeleteSheetOpen(false);
                }}
                isPending={softDelete.isPending}
                errorMessage={deleteError ?? (softDelete.error?.message ?? null)}
                // Scheduled-purge date: now() + 30 days. We compute it
                // here so the warning shows the EXACT date the user is
                // agreeing to, before the API call lands.
                purgeDate={(() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 30);
                    return d.toISOString();
                })()}
                onConfirm={async () => {
                    setDeleteError(null);
                    try {
                        const result = await softDelete.mutateAsync();
                        setPurgeAt(result.purge_at);
                        setDeleteSheetOpen(false);
                        // Sign the user out client-side so the next
                        // navigation lands on /login. The server-side
                        // strategy would 401 them anyway, but the
                        // explicit clear avoids a 401 flash.
                        logout();
                        clearAuthToken();
                        window.location.href = `/${locale}/login`;
                    } catch (e) {
                        setDeleteError((e as Error).message);
                    }
                }}
            />
        </div>
    );
}
