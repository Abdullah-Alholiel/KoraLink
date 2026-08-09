'use client';

import { useMutation } from '@tanstack/react-query';
import { fetcher } from '@/lib/fetcher';
import { useAppStore } from '@/store/useAppStore';
import { z } from 'zod';

// ─── Zod Schemas

interface SendOtpResponse {
  message: string;
  otpExpiresIn: number;
}

interface VerifyOtpResponse {
  isNewUser: boolean;
}

interface CompleteProfileResponse {
  id: string;
  phone: string;
  full_name: string;
  handle: string;
  avatar_url: string | null;
  skill_level: string | null;
  preferred_location: string | null;
  preferred_position: string | null;
  role: string;
}

// ─── Zod Schemas ──────────────────────────────────────

export const phoneSchema = z.object({
  phone: z
    .string()
    .min(9, 'Phone number must be at least 9 digits')
    .max(9, 'Phone number must be exactly 9 digits')
    .regex(/^\d+$/, 'Phone number must contain only digits'),
});

export const otpSchema = z.object({
  otp: z
    .string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only digits'),
});

export const completeProfileSchema = z.object({
  fullName: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(50, 'Full name must be under 50 characters'),
  preferredLocation: z.string().min(2, 'Location must be at least 2 characters').max(100).optional().or(z.literal('')),
  preferredPosition: z.string().optional(),
  skillLevel: z.enum(['Beginner', 'Intermediate', 'Advanced']).default('Intermediate'),
});

export type PhoneInput = z.infer<typeof phoneSchema>;
export type OtpInput = z.infer<typeof otpSchema>;
export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;

// ─── Send OTP ────────────────────────────────────────

export function useSendOtp() {
  return useMutation<
    SendOtpResponse,
    Error,
    { phone: string }
  >({
    mutationFn: ({ phone }) =>
      fetcher<SendOtpResponse>('/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: `+966${phone}` }),
      }),
  });
}

// ─── Verify OTP ───────────────────────────────────────

export function useVerifyOtp() {
  return useMutation<
    VerifyOtpResponse,
    Error,
    { phone: string; otp: string }
  >({
    mutationFn: ({ phone, otp }) =>
      fetcher<VerifyOtpResponse>('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ phone: `+966${phone}`, code: otp }),
      }),
  });
}

// ─── Complete Profile ─────────────────────────────────

export function useCompleteProfile() {
  const updateUser = useAppStore((s) => s.updateUser);
  const setOnboarded = useAppStore((s) => s.setOnboarded);

  return useMutation<
    CompleteProfileResponse,
    Error,
    CompleteProfileInput
  >({
    mutationFn: (data) =>
      // API key names use snake_case
      fetcher<CompleteProfileResponse>('/auth/complete-profile', {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: data.fullName,
          handle: data.fullName.toLowerCase().replace(/\s+/g, '_'),
          skill_level: data.skillLevel,
          preferred_location: data.preferredLocation,
          preferred_position: data.preferredPosition,
        }),
      }),
    onSuccess: (data) => {
      const skillLevel = data.skill_level
        ? (data.skill_level.charAt(0).toLowerCase() + data.skill_level.slice(1)) as 'beginner' | 'intermediate' | 'advanced'
        : 'intermediate';

      updateUser({
        id: data.id,
        fullName: data.full_name,
        handle: data.handle,
        avatarUrl: data.avatar_url ?? '',
        phone: data.phone,
        preferredLocation: data.preferred_location ?? '',
        preferredPosition: data.preferred_position ?? '',
        skillLevel,
        locale: 'ar',
      });
      setOnboarded(true);
    },
  });
}
