'use client';

import { Users, Crown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RosterPlayer } from '@/types';

interface TeamLineupProps {
    format: string;
    roster?: RosterPlayer[];
    hostId?: string;
    onPlayerClick?: (player: RosterPlayer) => void;
    /** Hide empty "Open" slots — used when the lineup doubles as a picker (e.g. POTM voting). */
    hideEmpty?: boolean;
}

/**
 * Two-team lineup with dynamic roster from DB.
 * Players auto-assigned to Home (White) / Away (Dark) by backend.
 *
 * The two teams are ALWAYS side-by-side (classic match-sheet look) on every
 * screen and every format. Inside each team card, players are always listed in
 * a single vertical column — one player per row — even for 11v11. The taller
 * list is intentional: it reads as a real team sheet and avoids cramming
 * player names into a half-width 2-column grid.
 */
export default function TeamLineup({ format, roster = [], onPlayerClick, hideEmpty = false }: TeamLineupProps) {
    const t = useTranslations();

    // Parse format: '7v7' → 7 per side
    const playersPerSide = parseInt(format?.split('v')[0] || '7');
    const perSide = !isNaN(playersPerSide) ? playersPerSide : 7;

    const homePlayers = roster.filter((p) => p.team === 'Home' || (p.isHost && !p.team));
    const awayPlayers = roster.filter((p) => p.team === 'Away');
    // Players with no team assigned (legacy data) — distribute evenly
    const unassigned = roster.filter((p) => !p.team && !p.isHost);
    unassigned.forEach((p, i) => {
        if (i % 2 === 0) homePlayers.push(p); else awayPlayers.push(p);
    });

    const homeOpen = Math.max(0, perSide - homePlayers.length);
    const awayOpen = Math.max(0, perSide - awayPlayers.length);

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-brand-black">{t('matchDetail.team')}</h2>
                <span className="text-xs font-bold text-gray-400 bg-gray-100 rounded-full px-3 py-1">
                    {format}
                </span>
            </div>

            <div className="flex gap-3">
                {/* ── Team Home (White) ── */}
                <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-card p-3">
                    <TeamHeader
                        dark={false}
                        count={homePlayers.length}
                        perSide={perSide}
                        label={t('matchDetail.teamWhite')}
                    />
                    <div className="space-y-2">
                        {homePlayers.map((player) => (
                            <PlayerSlot
                                key={player.id}
                                player={player}
                                onClick={onPlayerClick}
                            />
                        ))}
                        {!hideEmpty && Array.from({ length: homeOpen }).map((_, i) => (
                            <EmptySlot key={`home-empty-${i}`} dark={false} />
                        ))}
                    </div>
                </div>

                {/* ── Team Away (Dark) ── */}
                <div className="flex-1 min-w-0 bg-brand-black rounded-2xl shadow-card p-3">
                    <TeamHeader
                        dark
                        count={awayPlayers.length}
                        perSide={perSide}
                        label={t('matchDetail.teamDark')}
                    />
                    <div className="space-y-2">
                        {awayPlayers.map((player) => (
                            <PlayerSlot
                                key={player.id}
                                player={player}
                                dark
                                onClick={onPlayerClick}
                            />
                        ))}
                        {!hideEmpty && Array.from({ length: awayOpen }).map((_, i) => (
                            <EmptySlot key={`away-empty-${i}`} dark />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ─── Team header (count pill) ─── */
function TeamHeader({ dark, count, perSide, label }: { dark: boolean; count: number; perSide: number; label: string }) {
    return (
        <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${dark ? 'bg-gray-600' : 'bg-white border border-gray-300'}`} />
                <span className={`text-xs font-bold ${dark ? 'text-white' : 'text-brand-black'}`}>{label}</span>
            </div>
            <span className={`text-[10px] font-bold ${dark ? 'text-gray-500' : 'text-gray-400'}`}><span dir="ltr">{count}/{perSide}</span></span>
        </div>
    );
}

/* ─── Player Slot (filled) ─── */
function PlayerSlot({ player, dark, onClick }: { player: RosterPlayer; dark?: boolean; onClick?: (p: RosterPlayer) => void }) {
    return (
        <button
            onClick={() => onClick?.(player)}
            className={`w-full flex items-center gap-1.5 text-start transition-opacity ${dark ? 'hover:opacity-80' : 'hover:bg-gray-50'} rounded-lg p-1`}
        >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold overflow-hidden flex-shrink-0 ${
                dark ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-600'
            }`}>
                {player.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={player.avatarUrl} alt={player.name} className="w-full h-full object-cover" />
                ) : (
                    player.name.charAt(0).toUpperCase()
                )}
            </div>
            <span className={`text-[11px] font-medium flex-1 min-w-0 truncate ${dark ? 'text-white' : 'text-brand-black'}`}>
                {player.name}
            </span>
            {player.isHost && (
                <Crown className={`w-3 h-3 flex-shrink-0 ${dark ? 'text-amber-400' : 'text-brand-green'}`} strokeWidth={2.5} />
            )}
        </button>
    );
}

/* ─── Empty Slot ─── */
function EmptySlot({ dark }: { dark?: boolean }) {
    const t = useTranslations('matchDetail');
    return (
        <div className="flex items-center gap-1.5 px-0.5 py-0.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                dark ? 'bg-gray-800' : 'bg-gray-50'
            }`}>
                <Users className={`w-2.5 h-2.5 ${dark ? 'text-gray-600' : 'text-gray-300'}`} strokeWidth={1.5} />
            </div>
            <span className={`text-[11px] ${dark ? 'text-gray-600' : 'text-gray-300'}`}>
                {t('openSlot')}
            </span>
        </div>
    );
}
