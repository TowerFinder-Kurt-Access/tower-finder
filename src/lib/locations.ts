
export const STATIC_LOCATIONS: Record<string, Record<string, string[]>> = {
    'Canada': {
        'Alberta': ['Calgary', 'Edmonton'],
        'British Columbia': ['Vancouver', 'Victoria'],
        'Manitoba': ['Winnipeg'],
        'New Brunswick': ['Fredericton', 'Moncton'],
        'Newfoundland and Labrador': ["St. John's"],
        'Nova Scotia': ['Halifax'],
        'Ontario': ['Ottawa', 'Toronto'],
        'Prince Edward Island': ['Charlottetown'],
        'Quebec': ['Montreal', 'Quebec City'],
        'Saskatchewan': ['Regina', 'Saskatoon'],
    },
    'USA': {
        'Alabama': [], 'Alaska': [], 'Arizona': [], 'Arkansas': [], 'California': ['Los Angeles'],
        'Colorado': [], 'Connecticut': [], 'Delaware': [], 'Florida': ['Miami'], 'Georgia': [],
        'Hawaii': [], 'Idaho': [], 'Illinois': ['Chicago'], 'Indiana': [], 'Iowa': [],
        'Kansas': [], 'Kentucky': [], 'Louisiana': [], 'Maine': [], 'Maryland': [],
        'Massachusetts': [], 'Michigan': [], 'Minnesota': [], 'Mississippi': [], 'Missouri': [],
        'Montana': [], 'Nebraska': [], 'Nevada': [], 'New Hampshire': [], 'New Jersey': [],
        'New Mexico': [], 'New York': ['New York'], 'North Carolina': [], 'North Dakota': [],
        'Ohio': [], 'Oklahoma': [], 'Oregon': [], 'Pennsylvania': [], 'Rhode Island': [],
        'South Carolina': [], 'South Dakota': [], 'Tennessee': [], 'Texas': ['Houston'],
        'Utah': [], 'Vermont': [], 'Virginia': [], 'Washington': [], 'West Virginia': [],
        'Wisconsin': [], 'Wyoming': []
    },
};

export const STATIC_COUNTRIES = Object.keys(STATIC_LOCATIONS);

export const PROVINCE_TO_ABBR: Record<string, string> = {
    'Alberta': 'AB',
    'British Columbia': 'BC',
    'Manitoba': 'MB',
    'New Brunswick': 'NB',
    'Newfoundland and Labrador': 'NL',
    'Nova Scotia': 'NS',
    'Ontario': 'ON',
    'Prince Edward Island': 'PE',
    'Quebec': 'QC',
    'Saskatchewan': 'SK',
    'Northwest Territories': 'NT',
    'Nunavut': 'NU',
    'Yukon': 'YT',
    // US States
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
    'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
    'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
    'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
    'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
    'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
    'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY'
};

export const ABBR_TO_PROVINCE: Record<string, string> = Object.entries(PROVINCE_TO_ABBR).reduce((acc, [name, abbr]) => {
    acc[abbr] = name;
    return acc;
}, {} as Record<string, string>);
