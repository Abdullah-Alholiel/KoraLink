import { Rss, Bell } from 'lucide-react';

/* ── Dummy community feed data ────────────────────────── */
const feedItems = [
    {
        id: '1',
        type: 'activity' as const,
        user: { name: 'Ahmed Al-Farsi', avatar: 'A' },
        text: 'Hosting a **7v7 tonight** at KSU Stadium.',
        timeAgo: '2h ago',
    },
    {
        id: '2',
        type: 'badge' as const,
        user: { name: 'Sarah', avatar: 'S' },
        text: 'Earned the **Playmaker Badge** for 10 assists!',
        timeAgo: '15m ago',
        badge: '🏅',
    },
    {
        id: '3',
        type: 'urgent' as const,
        title: 'URGENT CALL',
        text: 'Only **1 spot left** in the Casual 5v5 at Olaya!',
        subtitle: 'Kickoff in 45m • Olaya Sports Park',
    },
    {
        id: '4',
        type: 'club' as const,
        club: { name: 'Riyadh Strikers', avatar: 'RS' },
        tag: 'CLUB NEWS',
        text: 'Looking for a goalkeeper for the upcoming season.',
    },
    {
        id: '5',
        type: 'activity' as const,
        user: { name: 'Omar H.', avatar: 'O' },
        text: 'Just completed a 10-match streak 🔥',
        timeAgo: '4h ago',
    },
];

export default function CommunityFeedPage() {
    return (
        <div className="pb-4">
            {/* ── Header ────────────────────────────── */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <h1 className="text-2xl font-bold text-brand-black">Community Feed</h1>
                <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50">
                    <Bell className="w-5 h-5 text-brand-black" strokeWidth={1.5} />
                </button>
            </div>

            {/* ── Feed Cards ────────────────────────── */}
            <div className="space-y-3 px-4">
                {feedItems.map((item) => {
                    /* Activity post */
                    if (item.type === 'activity') {
                        return (
                            <div key={item.id} className="bg-white rounded-2xl shadow-card p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center overflow-hidden">
                                        <span className="text-sm font-bold text-gray-500">{item.user!.avatar}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-bold text-brand-black">{item.user!.name}</h3>
                                            <span className="text-xs text-gray-400">{item.timeAgo}</span>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1" dangerouslySetInnerHTML={{
                                            __html: item.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                        }} />
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    /* Badge earned */
                    if (item.type === 'badge') {
                        return (
                            <div key={item.id} className="bg-white rounded-2xl shadow-card p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center relative">
                                        <span className="text-sm font-bold text-gray-500">{item.user!.avatar}</span>
                                        <span className="absolute -bottom-1 -end-1 text-lg">{item.badge}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-bold text-brand-black">{item.user!.name}</h3>
                                            <span className="text-xs text-gray-400">{item.timeAgo}</span>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1" dangerouslySetInnerHTML={{
                                            __html: item.text.replace(/\*\*(.*?)\*\*/g, '<span class="text-brand-green font-semibold">$1</span>')
                                        }} />
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    /* Urgent call */
                    if (item.type === 'urgent') {
                        return (
                            <div key={item.id} className="bg-white rounded-2xl shadow-card p-4 border-s-4 border-brand-red">
                                <p className="text-xs font-bold text-brand-red uppercase tracking-wide">{item.title}</p>
                                <p className="text-sm text-brand-black mt-1.5 font-medium" dangerouslySetInnerHTML={{
                                    __html: item.text.replace(/\*\*(.*?)\*\*/g, '<span class="text-brand-red font-bold">$1</span>')
                                }} />
                                <p className="text-xs text-gray-400 mt-1">{item.subtitle}</p>
                            </div>
                        );
                    }

                    /* Club news */
                    if (item.type === 'club') {
                        return (
                            <div key={item.id} className="bg-white rounded-2xl shadow-card p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-12 h-12 rounded-full bg-gray-100 flex-shrink-0 flex items-center justify-center">
                                        <Rss className="w-5 h-5 text-gray-400" strokeWidth={1.5} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-bold text-brand-black">{item.club!.name}</h3>
                                            <span className="text-[10px] font-bold text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full uppercase">
                                                {item.tag}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">{item.text}</p>
                                        <button className="text-xs font-medium text-gray-500 border border-gray-200 rounded-full px-3 py-1 mt-2">
                                            Details
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    return null;
                })}
            </div>
        </div>
    );
}
