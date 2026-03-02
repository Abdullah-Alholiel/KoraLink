'use client';

import { Users } from 'lucide-react';

/* ── Team Lineup Data ──────────────────────────────── */
const teamWhite = [
    { name: 'Ahmed (C)', avatar: 'A', filled: true },
    { name: 'Fahad K.', avatar: 'F', filled: true },
    { name: 'Yasser M.', avatar: 'Y', filled: true },
    { name: 'Open', avatar: '', filled: false },
    { name: 'Open', avatar: '', filled: false },
    { name: 'Open', avatar: '', filled: false },
    { name: 'Open', avatar: '', filled: false },
];

const teamDark = [
    { name: 'Omar S.', avatar: 'O', filled: true },
    { name: 'Khalid', avatar: 'K', filled: true },
    { name: 'Tariq', avatar: 'T', filled: true },
    { name: 'Open', avatar: '', filled: false },
    { name: 'Open', avatar: '', filled: false },
    { name: 'Open', avatar: '', filled: false },
    { name: 'Open', avatar: '', filled: false },
];

interface TeamLineupProps {
    format: string;
}

export default function TeamLineup({ format }: TeamLineupProps) {
    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-brand-black">Team Lineup</h2>
                <span className="text-xs font-bold text-gray-400 bg-gray-100 rounded-full px-3 py-1">
                    {format}
                </span>
            </div>

            {/* Team Cards Side by Side */}
            <div className="flex gap-3">
                {/* Team White */}
                <div className="flex-1 bg-white rounded-2xl shadow-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Users className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                        <span className="text-sm font-bold text-brand-black">Team White</span>
                    </div>
                    <div className="space-y-2.5">
                        {teamWhite.map((p, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${p.filled ? 'bg-gray-200 text-gray-600' : 'bg-gray-50 text-gray-300'
                                    }`}>
                                    {p.filled ? p.avatar : <Users className="w-3 h-3" />}
                                </div>
                                <span className={`text-xs ${p.filled ? 'text-brand-black font-medium' : 'text-gray-300'}`}>
                                    {p.name}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Team Dark */}
                <div className="flex-1 bg-brand-black rounded-2xl shadow-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Users className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                        <span className="text-sm font-bold text-white">Team Dark</span>
                    </div>
                    <div className="space-y-2.5">
                        {teamDark.map((p, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${p.filled ? 'bg-gray-700 text-gray-200' : 'bg-gray-800 text-gray-600'
                                    }`}>
                                    {p.filled ? p.avatar : <Users className="w-3 h-3" />}
                                </div>
                                <span className={`text-xs ${p.filled ? 'text-white font-medium' : 'text-gray-600'}`}>
                                    {p.name}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
