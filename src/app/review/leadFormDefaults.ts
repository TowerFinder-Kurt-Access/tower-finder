import type { FormState } from './leadFormState';

export const EMPTY: FormState = {
  dealType: '', callDate: '', source: '', fileId: '', owner: '', phone: '', contact: '',
  email: '', mailingAddress: '', siteAddress: '', towerId: '', payorOfRent: '', payorDetail: '',
  tenants: [], siteType: '', siteTypeDetail: '', currentRent: '', currentRentPeriod: '',
  rentIncreaseType: '', rentIncreaseAmount: '', leaseCommencement: '', leaseExpiration: '',
  rentEscalationDate: '', rofr: '', mortgage: '', mortgageInfo: '', feesPercent: false,
  feesPercentValue: '', feesDollar: false, feesDollarValue: '', notes: '', agreedItems: {},
  brettConfirmed: false, brettConfirmedBy: '', larryCallNotes: '', larryComments: '',
  adminSignName: '', larrySignName: '', status: 'draft',
};
