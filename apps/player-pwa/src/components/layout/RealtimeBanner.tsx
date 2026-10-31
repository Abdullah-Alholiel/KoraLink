'use client';

/**
 * RealtimeBanner (P2-133 sibling hardening — run #104, Reviewer B P0 finding)
 *
 * Reviewer B: "Realtime disconnect is invisible except in chat — socket
 * auto-reconnects but only ChatSheet shows an offline/failed state;
 * match-lobby/notification surfaces give no 'live updates paused /
 * reconnected' signal — a booking product where roster changes matter."
 *
 * ONE app-wide subscriber to the shared /lobby client's lifecycle fan-out
 * (`connect` / `disconnect` / `connect_error` already broadcast by
 * RealtimeClient.fanout — this component only LISTENS). Renders a slim amber
 * strip whenever the app-wide socket is down; hides it on reconnect.
 *
 * Not a duplicate of OfflineBanner (navigator network state): the device can
 * be online while the /lobby WebSocket is wedged — those are different
 * staleness signals. Mounted inside NotificationProvider so the banner's
 * lifetime matches the socket's (authenticated (main) surfaces only).
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CloudOff } from 'lucide-react';
import { getRealtime } from '@/lib/realtime';

export default function RealtimeBanner() {
    const t = useTranslations('realtime');
    const [down, setDown] = useState(false);

    useEffect(() => {
        const rt = getRealtime();
        rt.connect();

        const offDown = () => setDown(true);
        const offUp = () => setDown(false);
        const offDisconnect = rt.on('disconnect', offDown);
        const offError = rt.on('connect_error', offDown);
        const offConnect = rt.on('connect', offUp);

        return () => {
            offDisconnect();
            offError();
            offConnect();
            // Ref-counted release — mirrors NotificationProvider's cleanup.
            rt.disconnect();
            setDown(false);
        };
    }, []);

    if (!down) return null;

    return (
        <div
            role="status"
            className="mx-4 mt-2 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800"
        >
            <CloudOff className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span>{t('livePaused')}</span>
        </div>
    );
}
