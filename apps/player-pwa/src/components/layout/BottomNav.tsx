'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
    Rss,
    Users,
    MessageSquare,
    User,
} from 'lucide-react';

const navItems = [
    { key: 'feed', icon: Rss, label: 'Feed', href: '' },
    { key: 'clubs', icon: Users, label: 'Clubs', href: '/clubs' },
    { key: 'play', icon: null, label: 'Play', href: '/play' },
    { key: 'messages', icon: MessageSquare, label: 'Messages', href: '/messages' },
    { key: 'profile', icon: User, label: 'Profile', href: '/profile' },
];

export default function BottomNav() {
    const pathname = usePathname();
    const locale = pathname.split('/')[1] || 'en';

    const isActive = (href: string) => {
        const fullPath = `/${locale}${href}`;
        if (href === '') {
            return pathname === `/${locale}` || pathname === `/${locale}/`;
        }
        return pathname.startsWith(fullPath);
    };

    return (
        <nav className="
      flex-shrink-0
      bg-white border-t border-gray-100
      pb-safe pt-2 px-2
      relative z-50
    ">
            <div className="flex items-center justify-around">
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
                                    {item.label}
                                </span>
                            </Link>
                        );
                    }

                    /* ── Regular Nav Items ───────────────── */
                    const Icon = item.icon!;
                    return (
                        <Link
                            key={item.key}
                            href={`/${locale}${item.href}`}
                            className="flex flex-col items-center py-1 px-3 min-w-[48px]"
                        >
                            <Icon
                                className={`w-5 h-5 ${active ? 'text-brand-green' : 'text-gray-400'}`}
                                strokeWidth={active ? 2.5 : 1.5}
                            />
                            <span
                                className={`text-[10px] mt-1 ${active ? 'font-semibold text-brand-green' : 'font-normal text-gray-400'
                                    }`}
                            >
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
