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
    const [country, setCountryState] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('selectedCountry') || '';
        }
        return '';
    });

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
