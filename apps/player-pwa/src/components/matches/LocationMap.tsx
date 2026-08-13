import { MapPin } from 'lucide-react';

interface LocationMapProps {
    venueName: string;
    venueDetails: string;
    location: string;
}

export default function LocationMap({ venueName, venueDetails, location }: LocationMapProps) {
    const mapQuery = encodeURIComponent(`${venueName}, ${venueDetails || location}`);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;

    return (
        <div>
            {/* Venue Info — tappable to open in Google Maps */}
            <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between active:opacity-70 transition-opacity"
            >
                <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" strokeWidth={1.5} />
                    <div>
                        <p className="text-sm font-semibold text-brand-black">{venueName}</p>
                        <p className="text-xs text-gray-500">{venueDetails || location}</p>
                    </div>
                </div>
            </a>

            {/* Map Placeholder */}
            <div className="mt-4 h-28 rounded-2xl bg-gray-100 flex items-center justify-center">
                <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-500 border border-gray-200 rounded-full px-4 py-2 active:scale-95 transition-transform"
                >
                    View on Map
                </a>
            </div>
        </div>
    );
}
