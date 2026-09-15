export interface LeadFormState {
  id?: number;
  dealType: string;
  callDate: string;
  source: string;
  fileId: string;
  owner: string;
  phone: string;
  contact: string;
  email: string;
  mailingAddress: string;
  siteAddress: string;
  towerId: string;
  payorOfRent: string;
  payorDetail: string;
  tenants: string[];
  siteType: string;
  siteTypeDetail: string;
  currentRent: string;
  currentRentPeriod: string;
  rentIncreaseType: string;
  rentIncreaseAmount: string;
  leaseCommencement: string;
  leaseExpiration: string;
  rentEscalationDate: string;
  rofr: string;
  mortgage: string;
  mortgageInfo: string;
  feesPercent: boolean;
  feesPercentValue: string;
  feesDollar: boolean;
  feesDollarValue: string;
  notes: string;
  agreedItems: Record<string, boolean>;
  brettConfirmed: boolean;
  brettConfirmedBy: string;
  larryCallNotes: string;
  larryComments: string;
  adminSignName: string;
  larrySignName: string;
  status: string;
}

export type FormState = LeadFormState;

