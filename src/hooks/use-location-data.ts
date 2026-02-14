
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface LocationData {
    countries: string[];
    provinces: string[];
    cities: string[];
    loading: boolean;
}

export function useLocationData(
    selectedCountry: string,
    selectedProvince: string
) {
    const [data, setData] = useState<LocationData>({
        countries: [],
        provinces: [],
        cities: [],
        loading: false
    });

    // Fetch Countries
    const fetchCountries = useCallback(async () => {
        try {
            const res = await axios.get('/api/towers?distinct=countries');
            const countries = res.data.map((c: any) => c.country).filter(Boolean).sort();
            setData(prev => ({ ...prev, countries }));
        } catch (error) {
            console.error('Failed to fetch countries:', error);
        }
    }, []);

    // Fetch Provinces
    const fetchProvinces = useCallback(async () => {
        if (!selectedCountry) {
            setData(prev => ({ ...prev, provinces: [] }));
            return;
        }
        try {
            const res = await axios.get(`/api/towers?distinct=provinces&country=${encodeURIComponent(selectedCountry)}`);
            const provinces = res.data.map((p: any) => p.province || p.state).filter(Boolean).sort();
            setData(prev => ({ ...prev, provinces }));
        } catch (error) {
            console.error('Failed to fetch provinces:', error);
        }
    }, [selectedCountry]);

    // Fetch Cities
    const fetchCities = useCallback(async () => {
        if (!selectedCountry) {
            setData(prev => ({ ...prev, cities: [] }));
            return;
        }
        try {
            const params = new URLSearchParams();
            params.append('distinct', 'cities');
            params.append('country', selectedCountry);
            if (selectedProvince) {
                params.append('state', selectedProvince);
            }
            const res = await axios.get(`/api/towers?${params.toString()}`);
            const cities = res.data.map((c: any) => c.city).filter(Boolean).sort();
            setData(prev => ({ ...prev, cities }));
        } catch (error) {
            console.error('Failed to fetch cities:', error);
        }
    }, [selectedCountry, selectedProvince]);

    // Initial Load
    useEffect(() => {
        fetchCountries();
    }, [fetchCountries]);

    // Update Provinces when Country changes
    useEffect(() => {
        fetchProvinces();
    }, [fetchProvinces]);

    // Update Cities when Country or Province changes
    useEffect(() => {
        fetchCities();
    }, [fetchCities]);

    return data;
}
