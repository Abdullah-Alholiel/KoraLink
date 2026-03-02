'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    MapPin,
    ChevronRight,
    Lock,
    Calendar,
    Clock,
    AlertTriangle,
    Info,
    ArrowRight,
    Sparkles,
} from 'lucide-react';

/* ── Format options ─────────────────────────────── */
const FORMAT_OPTIONS = ['5v5', '6v6', '7v7', '8v8', '9v9'] as const;
type Format = (typeof FORMAT_OPTIONS)[number];

/* ── Booking mode ───────────────────────────────── */
type BookingMode = 'koralink' | 'self';

export default function HostMatchForm() {
    const router = useRouter();

    /* ── Form State ─────────────────────────────── */
    const [format, setFormat] = useState<Format>('7v7');
    const [bookingMode, setBookingMode] = useState<BookingMode>('self');
    const [isPublic, setIsPublic] = useState(true);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');

    const playerShare = 37;
    const hostCost = 0;

    return (
        <div className="flex flex-col h-full bg-white">
            {/* ══════════════════════════════════════
                HEADER
            ═══════════════════════════════════ */}
            <div className="flex items-center px-4 pt-4 pb-3 relative flex-shrink-0">
                <button
                    onClick={() => router.back()}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-50 z-10"
                >
                    <ArrowLeft className="w-5 h-5 text-brand-black" strokeWidth={2} />
                </button>
                <h1 className="text-base font-bold text-brand-black absolute left-1/2 -translate-x-1/2">
                    Host a Match
                </h1>
            </div>

            {/* ══════════════════════════════════════
                SCROLLABLE BODY
            ═══════════════════════════════════ */}
            <div className="flex-1 overflow-y-auto scroll-container pb-44">
                {/* ── VENUE ─────────────────────────── */}
                <div className="px-5 pt-4">
                    <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                        Venue
                    </p>

                    {/* Search venue row */}
                    <button className="w-full flex items-center gap-3 py-3 group">
                        <MapPin
                            className="w-5 h-5 text-brand-green flex-shrink-0"
                            strokeWidth={2}
                            fill="currentColor"
                        />
                        <span className="flex-1 text-start text-sm text-gray-400">
                            Search venues in Riyadh...
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-300" strokeWidth={2} />
                    </button>

                    {/* Booking mode tabs */}
                    <div className="flex rounded-full border border-gray-200 overflow-hidden mt-2">
                        <button
                            onClick={() => setBookingMode('koralink')}
                            className={`
                                flex-1 py-2.5 text-xs font-semibold text-center transition-all
                                ${bookingMode === 'koralink'
                                    ? 'bg-brand-green text-white'
                                    : 'bg-white text-gray-500'
                                }
                            `}
                        >
                            Book via KoraLink
                        </button>
                        <button
                            onClick={() => setBookingMode('self')}
                            className={`
                                flex-1 py-2.5 text-xs font-semibold text-center transition-all
                                ${bookingMode === 'self'
                                    ? 'bg-brand-green text-white'
                                    : 'bg-white text-gray-500'
                                }
                            `}
                        >
                            I have booked it
                        </button>
                    </div>

                    {/* Disclaimer based on booking mode */}
                    <div
                        className={`
                            mt-3 rounded-xl p-3.5 flex items-start gap-3
                            ${bookingMode === 'self'
                                ? 'bg-amber-50 border border-amber-200'
                                : 'bg-blue-50 border border-blue-200'
                            }
                        `}
                    >
                        {bookingMode === 'self' ? (
                            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
                        ) : (
                            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
                        )}
                        <p className="text-xs text-gray-600 leading-relaxed">
                            {bookingMode === 'self' ? (
                                <>
                                    <span className="font-bold text-gray-700">Disclaimer:</span>{' '}
                                    By selecting this, you confirm the pitch is fully secured.
                                    If the venue is unavailable at kick-off, your account will be
                                    held strictly liable to refund all paying players.
                                </>
                            ) : (
                                <>
                                    <span className="font-bold text-gray-700">Concierge Booking:</span>{' '}
                                    A KoraLink agent will text you within 1-2 hours to confirm your pitch.
                                    If the pitch is unavailable, your payment will be fully refunded
                                    to your KoraLink wallet credits.
                                </>
                            )}
                        </p>
                    </div>
                </div>

                {/* ── FORMAT ────────────────────────── */}
                <div className="px-5 pt-6">
                    <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                        Format
                    </p>
                    <div className="flex gap-2">
                        {FORMAT_OPTIONS.map((f) => (
                            <button
                                key={f}
                                onClick={() => setFormat(f)}
                                className={`
                                    flex-1 py-2 rounded-full text-sm font-semibold
                                    transition-all border
                                    ${format === f
                                        ? 'bg-brand-green text-white border-brand-green shadow-sm'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                    }
                                `}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── DATE & TIME ───────────────────── */}
                <div className="px-5 pt-6">
                    <p className="text-xs font-bold text-brand-green uppercase tracking-widest mb-3">
                        Date & Time
                    </p>
                    <div className="flex gap-3">
                        {/* Date Card */}
                        <div className="flex-1 bg-gray-50 rounded-xl border border-gray-100 p-3.5 relative">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                Date
                            </p>
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                                <span className="text-sm font-bold text-brand-black">
                                    {date
                                        ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                        })
                                        : 'Oct 24'}
                                </span>
                            </div>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                        </div>

                        {/* Time Card */}
                        <div className="flex-1 bg-gray-50 rounded-xl border border-gray-100 p-3.5 relative">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                Time
                            </p>
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
                                <span className="text-sm font-bold text-brand-black">
                                    {time
                                        ? new Date(`2025-01-01T${time}`).toLocaleTimeString('en-US', {
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            hour12: true,
                                        })
                                        : '8:00 PM'}
                                </span>
                            </div>
                            <input
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                        </div>
                    </div>
                </div>

                {/* ── PUBLIC MATCH TOGGLE ───────────── */}
                <div className="px-5 pt-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                                <Lock className="w-4 h-4 text-gray-500" strokeWidth={2} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-brand-black">Public Match</p>
                                <p className="text-xs text-gray-400">Anyone can join</p>
                            </div>
                        </div>

                        {/* Toggle */}
                        <button
                            onClick={() => setIsPublic(!isPublic)}
                            className={`
                                relative w-12 h-7 rounded-full transition-colors duration-200
                                ${isPublic ? 'bg-brand-green' : 'bg-gray-300'}
                            `}
                        >
                            <div
                                className={`
                                    absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md
                                    transition-transform duration-200
                                    ${isPublic ? 'translate-x-5' : 'translate-x-0.5'}
                                `}
                            />
                        </button>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════
                STICKY FOOTER
            ═══════════════════════════════════ */}
            <div className="absolute bottom-0 inset-x-0 bg-white border-t border-gray-100 px-5 pt-3 pb-5 animate-slide-in-bottom">
                {/* Cost row */}
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">Player share:</span>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-brand-black">SAR {playerShare}</span>
                        <span className="inline-flex items-center gap-1 bg-brand-green/10 text-brand-green text-[10px] font-bold px-2 py-0.5 rounded-full">
                            <Sparkles className="w-3 h-3" strokeWidth={2} />
                            HOST PLAYS FREE
                        </span>
                    </div>
                </div>
                <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-gray-400">Your total cost:</span>
                    <span className="text-base font-extrabold text-brand-black">
                        SAR {hostCost.toFixed(2)}
                    </span>
                </div>

                {/* Publish CTA */}
                <button
                    className="
                        w-full py-4 rounded-2xl bg-brand-green text-white
                        text-sm font-bold flex items-center justify-center gap-2
                        shadow-[0_4px_20px_rgba(27,67,50,0.4)]
                        active:scale-[0.98] transition-transform
                    "
                >
                    Publish Match
                    <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                </button>
            </div>
        </div>
    );
}
