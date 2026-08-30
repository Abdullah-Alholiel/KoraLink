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
    Moon,
    Flag,
} from 'lucide-react';
import { selectUser, selectIsAuth, useAppStore } from '@/store/useAppStore';
import { useUserStats, useUserProfile, useUpdatePushPreferences, type PushPreferences, type PushPreferencesInput } from '@/hooks/useUser';
import { useWalletBalance } from '@/hooks/useWallet';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { clearAuthToken } from '@/lib/fetcher';

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
    const { data: walletData } = useWalletBalance();
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
    };

    // Merge store + API data. API takes priority when available.
    const fullName = apiUser?.full_name ?? storeUser?.fullName ?? t('profile.guestName');
    const handle = apiUser?.handle ?? storeUser?.handle ?? '@guest';
    const avatarUrl = apiUser?.avatar_url ?? storeUser?.avatarUrl;
    const avatarInitial = fullName.charAt(0).toUpperCase();

    // Live balance from API
    const displayBalance = walletData?.balance ?? 0;

    return (
        <div className="pb-4">
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
                    endText={`SAR ${displayBalance.toFixed(2)}`}
                    href={`/${locale}/wallet`}
                />
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
                    onClick={() => {
                      logout();
                      clearAuthToken();
                      window.location.href = `/${locale}/login`;
                    }}
                />
            </div>

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
                            onClick={() => isSubscribed ? unsubscribe() : subscribe()}
                        />
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
        </div>
    );
}
