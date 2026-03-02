'use client';

import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Plus,
    ArrowUpRight,
    CreditCard,
    Trophy,
    Wallet,
    CornerDownLeft,
    ShoppingBag,
    FileText,
} from 'lucide-react';
import { mockTransactions, mockWalletBalance } from '@/lib/dummy-data';

function getTransactionIcon(icon: string) {
    switch (icon) {
        case 'match':
            return <Trophy className="w-5 h-5 text-brand-green" strokeWidth={1.5} />;
        case 'wallet':
            return <Wallet className="w-5 h-5 text-blue-500" strokeWidth={1.5} />;
        case 'refund':
            return <CornerDownLeft className="w-5 h-5 text-brand-green" strokeWidth={1.5} />;
        case 'store':
            return <ShoppingBag className="w-5 h-5 text-brand-red" strokeWidth={1.5} />;
        default:
            return <Wallet className="w-5 h-5 text-gray-400" strokeWidth={1.5} />;
    }
}

function groupTransactionsByDay(transactions: typeof mockTransactions) {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    const groups: { label: string; items: typeof mockTransactions }[] = [];
    const todayItems = transactions.filter(
        (t) => new Date(t.createdAt).toDateString() === today
    );
    const yesterdayItems = transactions.filter(
        (t) => new Date(t.createdAt).toDateString() === yesterday
    );
    const olderItems = transactions.filter((t) => {
        const d = new Date(t.createdAt).toDateString();
        return d !== today && d !== yesterday;
    });

    if (todayItems.length) groups.push({ label: 'TODAY', items: todayItems });
    if (yesterdayItems.length) groups.push({ label: 'YESTERDAY', items: yesterdayItems });
    if (olderItems.length) groups.push({ label: 'EARLIER', items: olderItems });

    return groups;
}

export default function WalletPage() {
    const router = useRouter();
    const groups = groupTransactionsByDay(mockTransactions);

    return (
        <div className="pb-4">
            {/* ── Header ────────────────────────────── */}
            <div className="flex-shrink-0 bg-white px-4 pt-3 pb-2">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="w-10 h-10 flex items-center justify-center"
                    >
                        <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
                    </button>
                    <h1 className="text-lg font-bold text-brand-black flex-1 text-center pe-10">
                        Transactions
                    </h1>
                </div>
            </div>

            {/* Balance Card */}
            <div className="bg-white mx-4 mt-4 rounded-2xl p-6 text-center">
                <p className="text-xs text-brand-green font-semibold uppercase tracking-widest">
                    Total Balance
                </p>
                <div className="flex items-baseline justify-center gap-2 mt-2">
                    <span className="text-4xl font-extrabold text-brand-black">
                        {mockWalletBalance.toFixed(2)}
                    </span>
                    <span className="text-2xl font-bold text-gray-400">ريال</span>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-center gap-8 mt-6 px-4">
                {[
                    { icon: Plus, label: 'Top Up', active: true },
                    { icon: ArrowUpRight, label: 'Withdraw', active: false },
                    { icon: CreditCard, label: 'Cards', active: false },
                ].map((action) => (
                    <button key={action.label} className="flex flex-col items-center gap-2">
                        <div
                            className={`w-14 h-14 rounded-full flex items-center justify-center ${action.active
                                ? 'bg-brand-green text-white'
                                : 'bg-gray-100 text-gray-600 border border-gray-200'
                                }`}
                        >
                            <action.icon className="w-6 h-6" strokeWidth={1.5} />
                        </div>
                        <span className="text-xs text-gray-600 font-medium">{action.label}</span>
                    </button>
                ))}
            </div>

            {/* Divider */}
            <div className="h-2 bg-brand-bg mt-6" />

            {/* Recent Activity */}
            <div className="px-4 pt-4 pb-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold text-brand-black">Recent Activity</h2>
                    <button className="text-sm font-medium text-gray-500 border border-gray-200 rounded-full px-3 py-1">
                        View All
                    </button>
                </div>

                {groups.map((group) => (
                    <div key={group.label} className="mb-4">
                        <p className="text-[10px] font-bold text-brand-green uppercase tracking-widest mb-3">
                            {group.label}
                        </p>
                        <div className="space-y-4">
                            {group.items.map((txn) => (
                                <div key={txn.id} className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0">
                                        {getTransactionIcon(txn.icon)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-brand-black truncate">
                                            {txn.title}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-0.5">{txn.description}</p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <span
                                            className={`text-sm font-bold ${txn.type === 'credit' ? 'text-brand-green' : 'text-brand-red'
                                                }`}
                                        >
                                            {txn.amount.toFixed(2)} ﷼ {txn.type === 'credit' ? '+' : '-'}
                                        </span>
                                        <FileText className="w-4 h-4 text-gray-300" strokeWidth={1.5} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
