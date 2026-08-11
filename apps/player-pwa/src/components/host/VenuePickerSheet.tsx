'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { useVenues, type VenueApi } from '@/hooks/useVenues';

export interface VenuePickerSheetProps {
    open: boolean;
    onClose: () => void;
    onSelect: (venue: VenueApi) => void;
    filterPartnerOnly?: boolean;
}

export default function VenuePickerSheet({ open, onClose, onSelect, filterPartnerOnly = false }: VenuePickerSheetProps) {
    const t = useTranslations();
    const [venueSearch, setVenueSearch] = useState('');

    // Note: is_koralink_partner filter will be wired when useVenues accepts it (Slice 1)
    const queryParams = venueSearch ? { city: venueSearch } : undefined;
    const { data: venues, isLoading: venuesLoading } = useVenues(queryParams);

    if (!open) return null;

    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
            <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white rounded-t-3xl z-[70] max-h-[70vh] overflow-y-auto animate-slide-up">
                <div className="flex justify-center pt-3 pb-2">
                    <div className="w-10 h-1 rounded-full bg-gray-300" />
                </div>
                <div className="px-5 pb-6">
                    <h2 className="text-lg font-bold text-brand-black mb-4">
                        {filterPartnerOnly ? t('host.partnerVenuesOnly') : t('host.selectVenueTitle')}
                    </h2>

                    {/* Search */}
                    <div className="flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2.5 border border-gray-100 focus-within:border-brand-green transition-colors mb-4">
                        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
                        <input
                            type="text"
                            value={venueSearch}
                            onChange={(e) => setVenueSearch(e.target.value)}
                            placeholder={filterPartnerOnly ? t('host.searchPartnerVenues') : t('host.searchByCity')}
                            className="flex-1 text-sm text-brand-black placeholder:text-gray-300 outline-none bg-transparent"
                        />
                    </div>

                    {/* Venue list */}
                    {venuesLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : venues && venues.length > 0 ? (
                        <div className="space-y-2">
                            {venues.map((venue) => (
                                <button
                                    key={venue.id}
                                    onClick={() => {
                                        onSelect(venue);
                                        onClose();
                                    }}
                                    className="w-full text-start p-4 rounded-xl border border-gray-200 hover:border-brand-green transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-bold text-brand-black">{venue.name}</p>
                                            <p className="text-xs text-gray-500">{venue.city} • {venue.pitch_count} {t('clubs.pitches')}</p>
                                        </div>
                                        <div className="text-end">
                                            <span className="text-xs font-bold text-brand-green">
                                                ★ {venue.rating.toFixed(1)}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-sm text-gray-400">
                                {venueSearch ? t('host.noVenuesFoundIn', { city: venueSearch }) : t('host.noVenuesFound')}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
