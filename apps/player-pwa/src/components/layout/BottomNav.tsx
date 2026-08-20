'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
    Rss,
    Users,
    MessageSquare,
    User,
} from 'lucide-react';
import { useAppStore, selectMessagesBadge } from '@/store/useAppStore';

const navItems = [
    { key: 'feed', icon: Rss, i18nKey: 'nav.feed' as const, href: '' },
    { key: 'clubs', icon: Users, i18nKey: 'nav.clubs' as const, href: '/clubs' },
    { key: 'play', icon: null, i18nKey: 'nav.play' as const, href: '/play' },
    { key: 'messages', icon: MessageSquare, i18nKey: 'nav.messages' as const, href: '/messages' },
    { key: 'profile', icon: User, i18nKey: 'nav.profile' as const, href: '/profile' },
];

export default function BottomNav() {
    const pathname = usePathname();
    const locale = (pathname ?? '').split('/')[1] || 'en';
    const t = useTranslations();
    const messagesBadge = useAppStore(selectMessagesBadge);

    const isActive = (href: string) => {
        const fullPath = `/${locale}${href}`;
        if (href === '') {
            return pathname === `/${locale}` || pathname === `/${locale}/`;
        }
        if (href === '/profile') {
            return (pathname ?? "").startsWith(fullPath) ||
                (pathname ?? "").startsWith(`/${locale}/my-games`) ||
                (pathname ?? "").startsWith(`/${locale}/personal-info`);
        }
        return (pathname ?? "").startsWith(fullPath);
    };

    return (
        <nav className="
      flex-shrink-0
      bg-white border-t border-gray-100
      pb-safe pt-2 px-2
      relative z-50
      w-full max-w-md mx-auto
    ">
            <div className="grid grid-cols-5 w-full max-w-xl mx-auto">
                {navItems.map((item) => {
                    const active = isActive(item.href);

                    /* ── Center Play FAB ────────────────── */
                    if (item.key === 'play') {
                        return (
                            <Link
                                key={item.key}
                                href={`/${locale}${item.href}`}
                                className="flex flex-col items-center -mt-7 relative"
                            >
                                <div className="
                  w-16 h-16 rounded-full bg-brand-green
                  flex items-center justify-center
                  shadow-[0_4px_20px_rgba(27,67,50,0.4)]
                  border-4 border-white
                  transition-transform active:scale-95
                  overflow-hidden
                ">
                                    <Image
                                        src="/images/play-icon.png"
                                        alt="Play"
                                        width={32}
                                        height={32}
                                        className="w-8 h-8 object-contain brightness-0 invert"
                                    />
                                </div>
                                <span className="text-[10px] font-semibold mt-0.5 text-brand-green">
                                    {t(item.i18nKey)}
                                </span>
                            </Link>
                        );
                    }

                    /* ── Regular Nav Items ───────────────── */
                    const Icon = item.icon!;
                    const badge = item.key === 'messages' ? messagesBadge : 0;
                    return (
                        <Link
                            key={item.key}
                            href={`/${locale}${item.href}`}
                            className="flex flex-col items-center py-1 px-3 min-w-[48px] relative"
                        >
                            <span className="relative">
                                <Icon
                                    className={`w-5 h-5 ${active ? 'text-brand-green' : 'text-gray-400'}`}
                                    strokeWidth={active ? 2.5 : 1.5}
                                />
                                {badge > 0 && (
                                    <span
                                        className="absolute -top-1.5 -end-2 min-w-[16px] h-4 px-1 rounded-full bg-brand-red text-white text-[9px] font-bold flex items-center justify-center border-2 border-white animate-scale-in"
                                        dir="ltr"
                                    >
                                        {badge > 99 ? '99+' : badge}
                                    </span>
                                )}
                            </span>
                            <span
                                className={`text-[10px] mt-1 ${active ? 'font-semibold text-brand-green' : 'font-normal text-gray-400'
                                    }`}
                            >
                                {t(item.i18nKey)}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
