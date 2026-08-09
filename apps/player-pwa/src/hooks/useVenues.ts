'use client';

import { useQuery } from '@tanstack/react-query';
import { fetcher, FetchError } from '@/lib/fetcher';
import type { Venue } from '@/types';

// ─── API Response Types ──────────────────────────────

export interface NearbyVenueRow {
  id: string;
  name: string;
  city: string;
  address: string;
  amenities: unknown;
  rating: number;
  is_approved: boolean;
  distance_m: number | null;
  owner_id: string;
  owner_name: string | null;
  pitch_count: number;
}

export interface VenueDetail extends Venue {
  owner: {
    id: string;
    full_name: string | null;
    handle: string | null;
    avatar_url: string | null;
    rating: number;
  };
  pitches: Array<{
    id: string;
    name: string;
    size: string;
    surface_type: string;
    hourly_rate: string | null;
    is_available: boolean | null;
  }>;
}

// ─── Fetch Nearby Venues ─────────────────────────────

export function useVenues(filters?: {
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  return useQuery<NearbyVenueRow[], FetchError>({
    queryKey: ['venues', filters],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value != null) params[key] = String(value);
        }
      }
      return fetcher<NearbyVenueRow[]>('/venues', {
        params: Object.keys(params).length > 0 ? params : undefined,
      });
    },
    staleTime: 300_000, // venues change rarely — cache 5 min
  });
}

// ─── Fetch Single Venue ──────────────────────────────

export function useVenue(id: string) {
  return useQuery<VenueDetail, FetchError>({
    queryKey: ['venue', id],
    queryFn: () => fetcher<VenueDetail>(`/venues/${id}`),
    enabled: !!id,
  });
}
