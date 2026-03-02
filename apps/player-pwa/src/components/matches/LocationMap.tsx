import { MapPin, ChevronRight } from 'lucide-react';

interface LocationMapProps {
    venueName: string;
    venueDetails: string;
    location: string;
}

export default function LocationMap({ venueName, venueDetails, location }: LocationMapProps) {
    return (
        <div>
            {/* Venue Info */}
            <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" strokeWidth={1.5} />
                    <div>
                        <p className="text-sm font-semibold text-brand-black">{venueName}</p>
                        <p className="text-xs text-gray-500">{venueDetails || location}</p>
                    </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" strokeWidth={1.5} />
            </div>

            {/* Map Placeholder */}
            <div className="mt-4 h-28 rounded-2xl bg-gray-100 flex items-center justify-center">
                <button className="text-sm font-medium text-gray-500 border border-gray-200 rounded-full px-4 py-2">
                    View on Map
                </button>
            </div>
        </div>
    );
}
