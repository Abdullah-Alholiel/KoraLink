'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
} from 'lucide-react';
import { mockUser, mockWalletBalance } from '@/lib/dummy-data';

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
                className={`flex-1 text-start text-sm font-medium ${danger ? 'text-brand-red' : 'text-brand-black'
                    }`}
            >
                {label}
            </span>
            {endText && (
                <span className="text-sm font-semibold text-gray-500">{endText}</span>
            )}
            {!danger && <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" strokeWidth={1.5} />}
        </>
    );

    const className = "w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors";

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
    const locale = pathname.split('/')[1] || 'en';

    return (
        <div className="pb-4">
            {/* ── Avatar & Name ─────────────────────── */}
            <div className="flex flex-col items-center pt-6 pb-4 bg-white">
                <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="text-2xl font-bold text-gray-400">
                            {mockUser.fullName.charAt(0)}
                        </span>
                    </div>
                    <button className="absolute bottom-0 end-0 w-8 h-8 rounded-full bg-brand-green flex items-center justify-center border-2 border-white">
                        <Camera className="w-4 h-4 text-white" strokeWidth={2} />
                    </button>
                </div>
                <h1 className="text-xl font-bold text-brand-black mt-3">
                    {mockUser.fullName}
                </h1>
                <p className="text-sm text-gray-400 mt-0.5">{mockUser.handle}</p>
            </div>

            {/* ── Main Menu ─────────────────────────── */}
            <div className="bg-white rounded-2xl mx-4 mt-4 overflow-hidden shadow-card">
                <MenuItem
                    icon={<User className="w-5 h-5" strokeWidth={1.5} />}
                    label="Personal Info"
                />
                <div className="h-px bg-gray-50 mx-4" />
                <MenuItem
                    icon={<Wallet className="w-5 h-5" strokeWidth={1.5} />}
                    label="Wallet"
                    endText={`SAR ${mockWalletBalance.toFixed(2)}`}
                    href={`/${locale}/wallet`}
                />
                <div className="h-px bg-gray-50 mx-4" />
                <MenuItem
                    icon={<Trophy className="w-5 h-5" strokeWidth={1.5} />}
                    label="My Games"
                    href={`/${locale}/play`}
                />
                <div className="h-px bg-gray-50 mx-4" />
                <MenuItem
                    icon={<LogOut className="w-5 h-5" strokeWidth={1.5} />}
                    label="Sign Out"
                    danger
                />
            </div>

            {/* ── Settings ──────────────────────────── */}
            <div className="bg-white rounded-2xl mx-4 mt-3 overflow-hidden shadow-card">
                <MenuItem
                    icon={<Globe className="w-5 h-5" strokeWidth={1.5} />}
                    label="Language"
                    endText="English"
                />
                <div className="h-px bg-gray-50 mx-4" />
                <MenuItem
                    icon={<Headphones className="w-5 h-5" strokeWidth={1.5} />}
                    label="Contact Support"
                />
            </div>

            {/* ── Legal ─────────────────────────────── */}
            <div className="bg-white rounded-2xl mx-4 mt-3 overflow-hidden shadow-card">
                <MenuItem
                    icon={<Shield className="w-5 h-5" strokeWidth={1.5} />}
                    label="Privacy Policy"
                />
                <div className="h-px bg-gray-50 mx-4" />
                <MenuItem
                    icon={<FileText className="w-5 h-5" strokeWidth={1.5} />}
                    label="Terms of Service"
                />
            </div>

            {/* ── Footer ────────────────────────────── */}
            <p className="text-center text-xs text-gray-300 mt-6 pb-2">
                KoraLink v2.1.0 • Made with 🇸🇦❤️ in KSA
            </p>
        </div>
    );
}
