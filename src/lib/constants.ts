// Tower workflow statuses
export const TOWER_STATUSES = {
  DETERMINING_OWNER_CALLS: 'determining_owner_calls',
  COULDNT_FIND_OWNER_CALLS: 'couldnt_find_owner_calls',
  DETERMINING_OWNER_TITLE: 'determining_owner_title',
  OWNER_FOUND: 'owner_found',
  CALLING_OWNER: 'calling_owner',
  RENEGOTIATION: 'renegotiation_in_process',
  CLOSED_WON: 'closed_won',
} as const;

export type TowerStatus = typeof TOWER_STATUSES[keyof typeof TOWER_STATUSES];

// Human-readable labels for each status
export const TOWER_STATUS_LABELS: Record<string, string> = {
  [TOWER_STATUSES.DETERMINING_OWNER_CALLS]: 'Determining property owner via calls',
  [TOWER_STATUSES.COULDNT_FIND_OWNER_CALLS]: "Couldn't figure out property owner via calls",
  [TOWER_STATUSES.DETERMINING_OWNER_TITLE]: 'Determining property owner via title deed purchase',
  [TOWER_STATUSES.OWNER_FOUND]: 'Property owner found',
  [TOWER_STATUSES.CALLING_OWNER]: 'Calling property owner',
  [TOWER_STATUSES.RENEGOTIATION]: 'Renegotiation in process',
  [TOWER_STATUSES.CLOSED_WON]: 'Closed Won',
  // Legacy values for backwards compatibility
  Unknown: 'Unknown',
  New: 'New',
  Researched: 'Researched',
  Contacted: 'Contacted',
  Closed: 'Closed',
};

// Options for dropdown/select components
export const TOWER_STATUS_OPTIONS = [
  { value: TOWER_STATUSES.DETERMINING_OWNER_CALLS, label: 'Determining property owner via calls' },
  { value: TOWER_STATUSES.COULDNT_FIND_OWNER_CALLS, label: "Couldn't figure out property owner via calls" },
  { value: TOWER_STATUSES.DETERMINING_OWNER_TITLE, label: 'Determining property owner via title deed purchase' },
  { value: TOWER_STATUSES.OWNER_FOUND, label: 'Property owner found' },
  { value: TOWER_STATUSES.CALLING_OWNER, label: 'Calling property owner' },
  { value: TOWER_STATUSES.RENEGOTIATION, label: 'Renegotiation in process' },
  { value: TOWER_STATUSES.CLOSED_WON, label: 'Closed Won' },
];

// Helper function to get label for a status
export function getStatusLabel(status: string): string {
  return TOWER_STATUS_LABELS[status] || status;
}

export const USA_STATES: Record<string, string> = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
    'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
    'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
    'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
    'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
    'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
    'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
    'District of Columbia': 'DC'
};

export const CANADA_PROVINCES: Record<string, string> = {
    'Alberta': 'AB', 'British Columbia': 'BC', 'Manitoba': 'MB', 'New Brunswick': 'NB',
    'Newfoundland and Labrador': 'NL', 'Nova Scotia': 'NS', 'Ontario': 'ON', 'Prince Edward Island': 'PE',
    'Quebec': 'QC', 'Saskatchewan': 'SK', 'Northwest Territories': 'NT', 'Nunavut': 'NU', 'Yukon': 'YT'
};

export const STATE_CODE_TO_NAME: Record<string, string> = {
    ...Object.fromEntries(Object.entries(USA_STATES).map(([k, v]) => [v, k])),
    ...Object.fromEntries(Object.entries(CANADA_PROVINCES).map(([k, v]) => [v, k]))
};
