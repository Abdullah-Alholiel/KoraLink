'use client';

import { Search, MapPin, Star, ChevronRight } from 'lucide-react';
import { useState } from 'react';

/* ── Dummy venues data ───────────────────────────────── */
const venues = [
    {
        id: '1',
        name: 'Kora Park Arena',
        location: 'Al Malqa, Riyadh',
        distance: '1.2km',
        rating: 4.9,
        amenities: ['parking', 'indoors', 'café', 'wifi'],
        avatar: 'KP',
    },
    {
        id: '2',
        name: 'Champions Field',
        location: 'Olaya Dist, Riyadh',
        distance: '3.5km',
        rating: 4.7,
        amenities: ['ac', 'parking', 'showers'],
        avatar: 'CF',
    },
    {
        id: '3',
        name: 'Desert Pitch Central',
        location: 'Diplomatic Qtr',
        distance: '4.8km',
        rating: 4.5,
        amenities: ['parking', 'café'],
        avatar: 'DP',
    },
    {
        id: '4',
        name: 'Al-Hilal Sports Club',
        location: 'King Fahd, Riyadh',
        distance: '6.1km',
        rating: 4.8,
        amenities: ['parking', 'indoors', 'showers', 'wifi'],
        avatar: 'AH',
    },
];

const filters = ['Nearby', 'Top Rated', 'Indoor', 'Available Now'];

export default function ClubsPage() {
    const [activeFilter, setActiveFilter] = useState('Nearby');
    const [searchQuery, setSearchQuery] = useState('');

    return (
        <div className="pb-4">
            {/* ── Header ────────────────────────────── */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h1 className="text-2xl font-bold text-brand-black">Clubs</h1>
                <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50">
                    <MapPin className="w-5 h-5 text-brand-black" strokeWidth={1.5} />
                </button>
            </div>

            {/* ── Search ────────────────────────────── */}
            <div className="px-4 pb-3">
                <div className="flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2.5 border border-gray-100">
                    <Search className="w-4 h-4 text-gray-400 flex-shrink-0" strokeWidth={2} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search venues..."
                        className="flex-1 text-sm text-brand-black placeholder:text-gray-400 outline-none bg-transparent"
                    />
                </div>
            </div>

            {/* ── Filter Pills ──────────────────────── */}
            <div className="flex gap-2 px-4 pb-4 overflow-x-auto scroll-container">
                {filters.map((filter) => (
                    <button
                        key={filter}
                        onClick={() => setActiveFilter(filter)}
                        className={`
              px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all
              ${activeFilter === filter
                                ? 'bg-brand-black text-white'
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                            }
            `}
                    >
                        {filter}
                    </button>
                ))}
            </div>

            {/* ── Venue Cards ───────────────────────── */}
            <div className="space-y-3 px-4">
                {venues.map((venue) => (
                    <div key={venue.id} className="bg-white rounded-2xl shadow-card p-4">
                        <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                                <h3 className="text-base font-bold text-brand-black">{venue.name}</h3>
                                <div className="flex items-center gap-1 mt-1">
                                    <MapPin className="w-3 h-3 text-gray-400" strokeWidth={1.5} />
                                    <span className="text-xs text-gray-500">
                                        {venue.location} • {venue.distance}
                                    </span>
                                </div>

                                {/* Rating + Amenities */}
                                <div className="flex items-center gap-2 mt-2.5">
                                    <div className="flex items-center gap-0.5">
                                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                        <span className="text-xs font-semibold text-amber-600">{venue.rating}</span>
                                    </div>
                                    <span className="text-gray-300">|</span>
                                    <div className="flex items-center gap-1.5">
                                        {venue.amenities.slice(0, 4).map((a) => (
                                            <span key={a} className="text-xs text-gray-400">
                                                {a === 'parking' ? '🅿️' : a === 'indoors' ? '🏠' : a === 'café' ? '☕' : a === 'wifi' ? '📶' : a === 'ac' ? '❄️' : a === 'showers' ? '🚿' : '•'}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Avatar + Book */}
                            <div className="flex flex-col items-end gap-2 ms-3">
                                <div className="w-12 h-12 rounded-xl bg-gray-200 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-gray-500">{venue.avatar}</span>
                                </div>
                                <button className="flex items-center gap-0.5 text-sm font-medium text-brand-black">
                                    Book
                                    <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
