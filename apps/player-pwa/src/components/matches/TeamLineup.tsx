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

/** Max number of empty-slot placeholders rendered per team. Large formats
 *  (11v11) would otherwise paint 8+ placeholder rows and dwarf the filled
 *  players. Filled players are ALWAYS all rendered. */
const MAX_EMPTY_SLOTS = 3;

/**
 * Two-team lineup with dynamic roster from DB.
 * Players auto-assigned to Home (White) / Away (Dark) by backend.
 *
 * Layout adapts to the format so every player is visible on every screen:
 * - Small sides (≤6 per team): single column per team, two teams side-by-side
 *   on ≥sm screens (the classic match-card look).
 * - Large sides (7+ per team: 7v7, 8v8, 11v11): player chips flow in a
 *   2-column grid inside each team card, and the two team cards stack
 *   vertically on phones (side-by-side from lg up) — full-width columns mean
 *   every row stays readable and the card never collapses into a narrow tower.
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

    // Large formats use the compact chip grid; small formats keep tall rows.
    const isLargeFormat = perSide >= 7;
    const colsClass = isLargeFormat ? 'grid grid-cols-2 gap-x-2 gap-y-1' : 'space-y-2';

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-brand-black">{t('matchDetail.team')}</h2>
                <span className="text-xs font-bold text-gray-400 bg-gray-100 rounded-full px-3 py-1">
                    {format}
                </span>
            </div>

            <div className={isLargeFormat ? 'flex flex-col lg:flex-row gap-3' : 'flex gap-3'}>
                {/* ── Team Home (White) ── */}
                <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-card p-3">
                    <TeamHeader
                        dark={false}
                        count={homePlayers.length}
                        perSide={perSide}
                        label={t('matchDetail.teamWhite')}
                    />
                    <div className={colsClass}>
                        {homePlayers.map((player) => (
                            <PlayerSlot
                                key={player.id}
                                player={player}
                                onClick={onPlayerClick}
                                compact={isLargeFormat}
                            />
                        ))}
                        {!hideEmpty && homeOpen > 0 && (
                            <>
                                <EmptySlot dark={false} />
                                {Array.from({ length: Math.min(homeOpen - 1, MAX_EMPTY_SLOTS - 1) }).map((_, i) => (
                                    <EmptySlot key={`home-empty-${i}`} dark={false} />
                                ))}
                            </>
                        )}
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
                    <div className={colsClass}>
                        {awayPlayers.map((player) => (
                            <PlayerSlot
                                key={player.id}
                                player={player}
                                dark
                                onClick={onPlayerClick}
                                compact={isLargeFormat}
                            />
                        ))}
                        {!hideEmpty && awayOpen > 0 && (
                            <>
                                <EmptySlot dark />
                                {Array.from({ length: Math.min(awayOpen - 1, MAX_EMPTY_SLOTS - 1) }).map((_, i) => (
                                    <EmptySlot key={`away-empty-${i}`} dark />
                                ))}
                            </>
                        )}
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
function PlayerSlot({ player, dark, onClick, compact }: { player: RosterPlayer; dark?: boolean; onClick?: (p: RosterPlayer) => void; compact?: boolean }) {
    return (
        <button
            onClick={() => onClick?.(player)}
            className={`w-full flex items-center ${compact ? 'gap-1' : 'gap-1.5'} text-start transition-opacity ${dark ? 'hover:opacity-80' : 'hover:bg-gray-50'} rounded-lg ${compact ? 'px-0.5 py-0.5' : 'p-1'}`}
        >
            <div className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} rounded-full flex items-center justify-center text-[10px] font-bold overflow-hidden flex-shrink-0 ${
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
        <div className={`flex items-center gap-1.5 ${dark ? 'px-0.5 py-0.5' : 'px-0.5 py-0.5'}`}>
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
