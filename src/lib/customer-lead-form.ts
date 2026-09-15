export interface CustomerLeadFormInput {
  dealType?: string | null;
  callDate?: string | null;
  source?: string | null;
  fileId?: string | null;
  owner?: string | null;
  phone?: string | null;
  contact?: string | null;
  email?: string | null;
  mailingAddress?: string | null;
  siteAddress?: string | null;
  towerId?: number | null;
  payorOfRent?: string | null;
  payorDetail?: string | null;
  tenants?: string[];
  siteType?: string | null;
  siteTypeDetail?: string | null;
  currentRent?: number | null;
  currentRentPeriod?: string | null;
  rentIncreaseType?: string | null;
  rentIncreaseAmount?: string | null;
  leaseCommencement?: string | null;
  leaseExpiration?: string | null;
  rentEscalationDate?: string | null;
  rofr?: string | null;
  mortgage?: string | null;
  mortgageInfo?: string | null;
  feesPercent?: boolean;
  feesPercentValue?: number | null;
  feesDollar?: boolean;
  feesDollarValue?: number | null;
  notes?: string | null;
  agreedItems?: Record<string, boolean> | null;
  brettConfirmed?: boolean;
  brettConfirmedBy?: string | null;
  larryCallNotes?: string | null;
  larryComments?: string | null;
  adminSignName?: string | null;
  larrySignName?: string | null;
  status?: string | null;
}

export const DEAL_TYPES = ['BUYOUT', 'RENEGOTIATION', 'NEW LEASE'] as const;
export const PAYORS = ['ATC', 'Crown', 'SBA', 'Carrier', 'Other'] as const;
export const TENANTS = ['Verizon', 'AT&T', 'T-Mobile', 'Telus', 'Rogers', 'Bell'] as const;
export const SITE_TYPES = ['Tower', 'Rooftop', 'Water Tank', 'Other'] as const;
export const RENT_PERIODS = ['Monthly', 'Annual'] as const;
export const RENT_INCREASE_TYPES = ['Annual', 'Term', 'N/A'] as const;
export const YES_NO = ['No', 'Yes'] as const;
export const FORM_STATUSES = ['draft', 'finalized', 'closed'] as const;

export function validateCustomerLeadForm(input: CustomerLeadFormInput): string | null {
  if (input.dealType && !(DEAL_TYPES as readonly string[]).includes(input.dealType)) return 'Invalid dealType';
  if (input.payorOfRent && !(PAYORS as readonly string[]).includes(input.payorOfRent)) return 'Invalid payorOfRent';
  if (input.siteType && !(SITE_TYPES as readonly string[]).includes(input.siteType)) return 'Invalid siteType';
  if (input.currentRentPeriod && !(RENT_PERIODS as readonly string[]).includes(input.currentRentPeriod)) return 'Invalid currentRentPeriod';
  if (input.rentIncreaseType && !(RENT_INCREASE_TYPES as readonly string[]).includes(input.rentIncreaseType)) return 'Invalid rentIncreaseType';
  if (input.rofr && !(YES_NO as readonly string[]).includes(input.rofr)) return 'Invalid rofr';
  if (input.mortgage && !(YES_NO as readonly string[]).includes(input.mortgage)) return 'Invalid mortgage';
  if (input.status && !(FORM_STATUSES as readonly string[]).includes(input.status)) return 'Invalid status';
  if (input.tenants) {
    for (const t of input.tenants) {
      if (typeof t !== 'string' || t.length > 80) return 'Invalid tenants';
    }
  }
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return 'Invalid email';
  return null;
}

function toDateOrNull(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function toNumOrNull(v: number | null | undefined): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'number' || Number.isNaN(v)) return undefined;
  return v;
}

export function toCustomerLeadFormData(input: CustomerLeadFormInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (input.dealType !== undefined) data.dealType = input.dealType || null;
  if (input.callDate !== undefined) data.callDate = toDateOrNull(input.callDate);
  if (input.source !== undefined) data.source = input.source || null;
  if (input.fileId !== undefined) data.fileId = input.fileId || null;
  if (input.owner !== undefined) data.owner = input.owner || null;
  if (input.phone !== undefined) data.phone = input.phone || null;
  if (input.contact !== undefined) data.contact = input.contact || null;
  if (input.email !== undefined) data.email = input.email || null;
  if (input.mailingAddress !== undefined) data.mailingAddress = input.mailingAddress || null;
  if (input.siteAddress !== undefined) data.siteAddress = input.siteAddress || null;
  if (input.towerId !== undefined) data.towerId = input.towerId;
  if (input.payorOfRent !== undefined) data.payorOfRent = input.payorOfRent || null;
  if (input.payorDetail !== undefined) data.payorDetail = input.payorDetail || null;
  if (input.tenants !== undefined) data.tenants = input.tenants;
  if (input.siteType !== undefined) data.siteType = input.siteType || null;
  if (input.siteTypeDetail !== undefined) data.siteTypeDetail = input.siteTypeDetail || null;
  if (input.currentRent !== undefined) data.currentRent = toNumOrNull(input.currentRent);
  if (input.currentRentPeriod !== undefined) data.currentRentPeriod = input.currentRentPeriod || null;
  if (input.rentIncreaseType !== undefined) data.rentIncreaseType = input.rentIncreaseType || null;
  if (input.rentIncreaseAmount !== undefined) data.rentIncreaseAmount = input.rentIncreaseAmount || null;
  if (input.leaseCommencement !== undefined) data.leaseCommencement = toDateOrNull(input.leaseCommencement);
  if (input.leaseExpiration !== undefined) data.leaseExpiration = toDateOrNull(input.leaseExpiration);
  if (input.rentEscalationDate !== undefined) data.rentEscalationDate = toDateOrNull(input.rentEscalationDate);
  if (input.rofr !== undefined) data.rofr = input.rofr || null;
  if (input.mortgage !== undefined) data.mortgage = input.mortgage || null;
  if (input.mortgageInfo !== undefined) data.mortgageInfo = input.mortgageInfo || null;
  if (input.feesPercent !== undefined) data.feesPercent = input.feesPercent;
  if (input.feesPercentValue !== undefined) data.feesPercentValue = toNumOrNull(input.feesPercentValue);
  if (input.feesDollar !== undefined) data.feesDollar = input.feesDollar;
  if (input.feesDollarValue !== undefined) data.feesDollarValue = toNumOrNull(input.feesDollarValue);
  if (input.notes !== undefined) data.notes = input.notes || null;
  if (input.agreedItems !== undefined) data.agreedItems = input.agreedItems;
  if (input.brettConfirmed !== undefined) {
    data.brettConfirmed = input.brettConfirmed;
    data.brettConfirmedAt = input.brettConfirmed ? new Date() : null;
  }
  if (input.brettConfirmedBy !== undefined) data.brettConfirmedBy = input.brettConfirmedBy || null;
  if (input.larryCallNotes !== undefined) data.larryCallNotes = input.larryCallNotes || null;
  if (input.larryComments !== undefined) data.larryComments = input.larryComments || null;
  if (input.adminSignName !== undefined) {
    data.adminSignName = input.adminSignName || null;
    data.adminSignAt = input.adminSignName ? new Date() : null;
  }
  if (input.larrySignName !== undefined) {
    data.larrySignName = input.larrySignName || null;
    data.larrySignAt = input.larrySignName ? new Date() : null;
  }
  if (input.status !== undefined) data.status = input.status || 'draft';
  return data;
}

