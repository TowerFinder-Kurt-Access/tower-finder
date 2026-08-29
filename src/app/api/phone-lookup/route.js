import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import axios from 'axios';

export async function GET(request) {
    try { await getAuthUser(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const address = searchParams.get('address');
    const city = searchParams.get('city');
    const state = searchParams.get('state');

    if (!name) {
        return NextResponse.json({ error: 'Missing name parameter' }, { status: 400 });
    }

    const WHITEPAGES_KEY = process.env.WHITEPAGES_API_KEY;

    if (!WHITEPAGES_KEY) {
        return NextResponse.json({ phone: null, note: 'Whitepages API key not configured' });
    }

    try {
        const response = await axios.get('https://proapi.whitepages.com/3.1/person', {
            params: {
                api_key: WHITEPAGES_KEY,
                name: name,
                address_street: address || '',
                address_city: city || '',
                address_state_code: state || ''
            },
            timeout: 10000
        });

        if (response.data && response.data.results && response.data.results.length > 0) {
            const person = response.data.results[0];
            const phones = [];

            if (person.phones) {
                person.phones.forEach(phone => {
                    if (phone.phone_number) {
                        phones.push({
                            number: phone.phone_number,
                            type: phone.line_type || 'unknown'
                        });
                    }
                });
            }

            return NextResponse.json({ phones: phones, person: person });
        } else {
            return NextResponse.json({ phones: [], person: null });
        }

    } catch (error) {
        console.error("Whitepages API Error:", error.message);
        return NextResponse.json({ phones: [], error: 'Phone lookup failed' });
    }
}
