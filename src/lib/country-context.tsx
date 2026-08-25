'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface CountryContextValue {
    country: string;
    setCountry: (country: string) => void;
}

const CountryContext = createContext<CountryContextValue>({
    country: '',
    setCountry: () => { },
});

export function CountryProvider({ children }: { children: ReactNode }) {
    // Start empty so the first client render matches the server output.
    // localStorage is loaded after hydration to avoid a server/client mismatch.
    const [country, setCountryState] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem('selectedCountry');
        if (saved) {
            setCountryState(saved);
        }
    }, []);

    const setCountry = (value: string) => {
        setCountryState(value);
        if (value) {
            localStorage.setItem('selectedCountry', value);
        } else {
            localStorage.removeItem('selectedCountry');
        }
    };

    return (
        <CountryContext.Provider value={{ country, setCountry }}>
            {children}
        </CountryContext.Provider>
    );
}

export function useCountry() {
    return useContext(CountryContext);
}
