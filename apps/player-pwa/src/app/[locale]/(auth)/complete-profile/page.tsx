'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
    ArrowLeft,
    ArrowRight,
    Camera,
    MapPin,
    Trophy,
    ChevronDown,
} from 'lucide-react';
import type { SkillLevel } from '@/types';

export default function CompleteProfilePage() {
    const router = useRouter();
    const pathname = usePathname();
    const locale = pathname.split('/')[1] || 'en';

    const [fullName, setFullName] = useState('');
    const [location, setLocation] = useState('');
    const [position, setPosition] = useState('');
    const [skillLevel, setSkillLevel] = useState<SkillLevel>('intermediate');

    const skillLevels: { value: SkillLevel; label: string }[] = [
        { value: 'beginner', label: 'Beginner' },
        { value: 'intermediate', label: 'Intermediate' },
        { value: 'advanced', label: 'Advanced' },
    ];

    const handleFinish = () => {
        if (fullName.trim()) {
            router.push(`/${locale}`);
        }
    };

    return (
        <div className="flex flex-col min-h-full">
            {/* ── Header ────────────────────────────── */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-2 pt-safe">
                <button
                    onClick={() => router.back()}
                    className="w-10 h-10 flex items-center justify-center"
                >
                    <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
                </button>
            </div>

            {/* ── Content ───────────────────────────── */}
            <div className="flex-1 px-6 pb-24">
                <h1 className="text-2xl font-bold text-brand-black mt-2">
                    Complete your profile
                </h1>
                <p className="text-sm text-gray-400 mt-1.5">
                    Just a few more details to get you on the pitch.
                </p>

                {/* Avatar */}
                <div className="flex justify-center mt-6">
                    <div className="relative">
                        <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
                            <span className="text-3xl text-gray-300">👤</span>
                        </div>
                        <button className="absolute bottom-0 end-0 w-8 h-8 rounded-full bg-brand-black flex items-center justify-center border-2 border-white">
                            <Camera className="w-4 h-4 text-white" strokeWidth={2} />
                        </button>
                    </div>
                </div>

                {/* Full Name */}
                <div className="mt-6">
                    <label className="text-sm font-semibold text-brand-black">Full Name</label>
                    <div className="flex items-center gap-2 mt-2 border border-gray-200 rounded-xl px-4 py-3 focus-within:border-brand-green transition-colors">
                        <span className="text-gray-400">👤</span>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g. Abdullah Ahmed"
                            className="flex-1 text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent"
                        />
                    </div>
                </div>

                {/* Preferred Location */}
                <div className="mt-4">
                    <label className="text-sm font-semibold text-brand-black">
                        Preferred Location
                    </label>
                    <div className="flex items-center gap-2 mt-2 border border-gray-200 rounded-xl px-4 py-3 focus-within:border-brand-green transition-colors">
                        <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={1.5} />
                        <input
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="e.g. Riyadh"
                            className="flex-1 text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent"
                        />
                    </div>
                </div>

                {/* Preferred Position */}
                <div className="mt-4">
                    <label className="text-sm font-semibold text-brand-black">
                        Preferred Position{' '}
                        <span className="text-gray-400 font-normal">(Optional)</span>
                    </label>
                    <div className="flex items-center gap-2 mt-2 border border-gray-200 rounded-xl px-4 py-3">
                        <Trophy className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={1.5} />
                        <select
                            value={position}
                            onChange={(e) => setPosition(e.target.value)}
                            className="flex-1 text-sm text-brand-black outline-none bg-transparent appearance-none"
                        >
                            <option value="">Select your position</option>
                            <option value="goalkeeper">Goalkeeper</option>
                            <option value="defender">Defender</option>
                            <option value="midfielder">Midfielder</option>
                            <option value="forward">Forward</option>
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={1.5} />
                    </div>
                </div>

                {/* Skill Level */}
                <div className="mt-4">
                    <label className="text-sm font-semibold text-brand-black">
                        Skill Level{' '}
                        <span className="text-gray-400 font-normal">(Optional)</span>
                    </label>
                    <div className="flex gap-2 mt-2">
                        {skillLevels.map((level) => (
                            <button
                                key={level.value}
                                onClick={() => setSkillLevel(level.value)}
                                className={`
                  px-4 py-2.5 rounded-full text-sm font-medium transition-all
                  ${skillLevel === level.value
                                        ? 'bg-brand-green text-white'
                                        : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                                    }
                `}
                            >
                                {level.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Bottom Section ────────────────────── */}
            <div className="absolute bottom-0 left-0 right-0 px-6 pb-8 pb-safe bg-white">
                <button
                    onClick={handleFinish}
                    disabled={!fullName.trim()}
                    className={`
            w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2
            transition-all active:scale-[0.98]
            ${fullName.trim()
                            ? 'bg-brand-green text-white'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }
          `}
                >
                    Finish Setup
                    <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                </button>
            </div>
        </div>
    );
}
