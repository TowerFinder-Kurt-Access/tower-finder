'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// navigator.geolocation requires HTTPS in production (localhost is exempt).
export interface GeolocationPosition {
    lat: number;
    lon: number;
    accuracy?: number;
}

export interface UseGeolocationResult {
    position: GeolocationPosition | null;
    error: string | null;
    isWatching: boolean;
    start: () => void;
    stop: () => void;
}

export function useGeolocation(): UseGeolocationResult {
    const [position, setPosition] = useState<GeolocationPosition | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isWatching, setIsWatching] = useState(false);
    const watchIdRef = useRef<number | null>(null);

    const stop = useCallback(() => {
        if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }
        watchIdRef.current = null;
        setIsWatching(false);
    }, []);

    const start = useCallback(() => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setError('Geolocation is not supported in this browser');
            return;
        }
        if (watchIdRef.current !== null) return;

        setError(null);
        setIsWatching(true);

        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                setPosition({
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    accuracy: pos.coords.accuracy
                });
                setError(null);
            },
            (err) => {
                setError(err.message || 'Unable to retrieve location');
                setPosition(null);
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
    }, []);

    useEffect(() => {
        return () => {
            if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, []);

    return { position, error, isWatching, start, stop };
}
