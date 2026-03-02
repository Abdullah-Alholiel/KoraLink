'use client';

import { Search, Clock } from 'lucide-react';

/* ── Dummy messages data ─────────────────────────────── */
const activeDiscussions = [
    {
        id: 'd1',
        title: 'King Saud University Stadium',
        time: 'Tonight, 8:00 PM',
        joined: '6/10',
        status: 'JOINED',
        statusColor: 'bg-brand-black text-white',
        avatars: ['A', 'K', 'O'],
        extra: '+3',
        lastMessage: { user: 'Ahmed', text: 'Can someone bring an extra ball?', time: '2m' },
        cta: 'Join Chat',
    },
    {
        id: 'd2',
        title: 'Al-Nahda Park Field',
        time: 'Tomorrow, 6:30 PM',
        joined: '',
        status: 'FULL',
        statusColor: 'bg-gray-200 text-gray-600',
        avatars: ['S', 'F'],
        extra: '+8',
        lastMessage: null,
        cta: 'View Chat',
    },
];

const directMessages = [
    {
        id: 'm1',
        name: 'Khalid Al-Faisal',
        avatar: 'K',
        text: 'Are we still on for the match on Friday?',
        time: '2m ago',
        unread: 1,
    },
    {
        id: 'm2',
        name: 'Sarah Johnson',
        avatar: 'S',
        text: 'Great game yesterday! The team played...',
        time: '1h ago',
        unread: 0,
    },
    {
        id: 'm3',
        name: 'Omar Hassan',
        avatar: 'O',
        text: 'Send me the location pin please.',
        time: 'Yesterday',
        unread: 0,
    },
    {
        id: 'm4',
        name: 'Team Support',
        avatar: '🎧',
        isSystem: true,
        text: 'Your booking #4492 has been confirmed.',
        time: '2d ago',
        unread: 0,
    },
];

export default function MessagesPage() {
    return (
        <div className="pb-4">
            {/* ── Header ────────────────────────────── */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <h1 className="text-2xl font-bold text-brand-black">Messages</h1>
                <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50">
                    <Search className="w-5 h-5 text-brand-black" strokeWidth={1.5} />
                </button>
            </div>

            {/* ── Active Discussions ────────────────── */}
            <div className="px-4">
                <h2 className="text-base font-bold text-brand-black mb-3">Active Discussions</h2>

                <div className="space-y-3">
                    {activeDiscussions.map((disc) => (
                        <div key={disc.id} className="bg-white rounded-2xl shadow-card p-4">
                            {/* Header row */}
                            <div className="flex items-start justify-between">
                                <h3 className="text-sm font-bold text-brand-black flex-1">{disc.title}</h3>
                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${disc.statusColor}`}>
                                    {disc.joined ? `${disc.joined} ${disc.status}` : disc.status}
                                </span>
                            </div>

                            {/* Time */}
                            <div className="flex items-center gap-1 mt-1.5">
                                <Clock className="w-3 h-3 text-gray-400" strokeWidth={1.5} />
                                <span className="text-xs text-gray-500">{disc.time}</span>
                            </div>

                            {/* Avatars + CTA */}
                            <div className="flex items-center justify-between mt-3">
                                <div className="flex items-center gap-2">
                                    <div className="flex -space-x-2 rtl:space-x-reverse">
                                        {disc.avatars.map((a, i) => (
                                            <div
                                                key={i}
                                                className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center"
                                                style={{ zIndex: 3 - i }}
                                            >
                                                <span className="text-[10px] font-bold text-gray-500">{a}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <span className="text-xs text-brand-green font-medium">{disc.extra}</span>
                                </div>
                                <button className="bg-brand-black text-white text-xs font-bold px-4 py-2 rounded-full">
                                    {disc.cta}
                                </button>
                            </div>

                            {/* Last message */}
                            {disc.lastMessage && (
                                <div className="mt-3 pt-3 border-t border-gray-100">
                                    <p className="text-xs text-gray-600">
                                        <span className="font-semibold text-brand-black">• {disc.lastMessage.user}:</span>{' '}
                                        {disc.lastMessage.text}{' '}
                                        <span className="text-gray-400">{disc.lastMessage.time}</span>
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Direct Messages ──────────────────── */}
            <div className="px-4 mt-6">
                <h2 className="text-base font-bold text-brand-black mb-3">Messages</h2>

                <div className="bg-white rounded-2xl shadow-card divide-y divide-gray-50">
                    {directMessages.map((msg) => (
                        <div key={msg.id} className="flex items-center gap-3 p-4">
                            <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center ${msg.isSystem ? 'bg-gray-100' : 'bg-gray-200'
                                }`}>
                                <span className={`${msg.isSystem ? 'text-lg' : 'text-sm font-bold text-gray-500'}`}>
                                    {msg.avatar}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-brand-black">{msg.name}</h3>
                                    <span className="text-xs text-gray-400">{msg.time}</span>
                                </div>
                                <p className="text-sm text-gray-500 truncate mt-0.5">{msg.text}</p>
                            </div>
                            {msg.unread > 0 && (
                                <div className="w-5 h-5 rounded-full bg-brand-green flex items-center justify-center flex-shrink-0">
                                    <span className="text-[10px] font-bold text-white">{msg.unread}</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
