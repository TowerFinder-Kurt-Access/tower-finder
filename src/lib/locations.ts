
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
