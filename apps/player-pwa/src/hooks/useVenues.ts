'use client';

import { useQuery } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';

// ─── API Response Types ────────────────────────────────

export interface VenueApi {
  id: string;
  name: string;
  city: string;
  address: string;
  amenities: unknown;
  rating: number;
  is_approved: boolean;
  is_koralink_partner: boolean;
  distance_m: number | null;
  owner_id: string;
  owner_name: string | null;
  pitch_count: number;
}

export interface PitchApi {
  id: string;
  name: string;
  size: string;
  surface_type: string;
  hourly_rate: string | number;
  environment?: string;
}

export interface VenueDetailApi extends VenueApi {
  owner?: {
    id: string;
    full_name: string | null;
    handle: string | null;
    avatar_url: string | null;
    rating: number;
  };
  pitches?: PitchApi[];
}

// ─── Fetch Nearby Venues ───────────────────────────────

export function useVenues(params?: {
  lat?: number;
  lng?: number;
  city?: string;
  is_koralink_partner?: boolean;
}) {
  return useQuery<VenueApi[], FetchError>({
    queryKey: ['venues', params],
    queryFn: () => {
      const searchParams: Record<string, string> = {};
      if (params?.lat != null) searchParams.lat = String(params.lat);
      if (params?.lng != null) searchParams.lng = String(params.lng);
      if (params?.city) searchParams.city = params.city;
      if (params?.is_koralink_partner != null)
        searchParams.is_koralink_partner = String(params.is_koralink_partner);
      return fetcher<VenueApi[]>('/venues', {
        params: Object.keys(searchParams).length > 0 ? searchParams : undefined,
      });
    },
    staleTime: 300_000, // 5 min — venues change rarely
  });
}

// ─── Fetch Single Venue Detail ─────────────────────────

export function useVenue(venueId: string | null) {
  return useQuery<VenueDetailApi, FetchError>({
    queryKey: ['venue', venueId],
    queryFn: () => fetcher<VenueDetailApi>(`/venues/${venueId}`),
    enabled: !!venueId,
  });
}
