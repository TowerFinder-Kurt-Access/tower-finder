import type { ReactElement } from 'react';
import { PAYORS, TENANTS, SITE_TYPES } from '@/lib/customer-lead-form';
import type { LeadFormState } from './leadFormState';

const BOOST_CONTACT = { name: 'Larry Heuchert', phone: '310-409-6614', email: 'larry@boostft.com' };

export function LeadPrintDoc({ form }: { form: LeadFormState }) {
  const check = (on: boolean): string => (on ? '☑' : '☐');
  const value = (v: string): string => (v && v.trim() ? v : ' ');
  const field = (label: string, val: string): ReactElement => (
    <div>
      <div className="doc-label">{label}</div>
      <div className="doc-field">{value(val)}</div>
    </div>
  );
  return (
    <div className="print-doc">
      <div className="doc-head">
        <div className="doc-checks">
          <span>{check(form.dealType === 'BUYOUT')} BUYOUT</span>
          <span>{check(form.dealType === 'RENEGOTIATION')} RENEGOTIATION</span>
          <span>{check(form.dealType === 'NEW LEASE')} NEW LEASE</span>
        </div>
        <div className="doc-contact">
          <div><strong>{BOOST_CONTACT.name}</strong></div>
          <div>{BOOST_CONTACT.phone}</div>
          <div>{BOOST_CONTACT.email}</div>
        </div>
      </div>
      <div className="doc-rule" />
      <div className="doc-grid">
        {field('Call Date', form.callDate)}
        {field('Source', form.source)}
        {field('File ID', form.fileId)}
        {field('Owner', form.owner)}
        {field('Phone', form.phone)}
        {field('Tower ID', form.towerId)}
        {field('Contact', form.contact)}
        {field('E-mail', form.email)}
      </div>
      <div style={{ marginTop: 8 }}>{field('Mailing Address', form.mailingAddress)}</div>
      <div style={{ marginTop: 8 }}>{field('Site Address', form.siteAddress)}</div>
      <div className="doc-rule" />
      <div className="doc-cols3">
        <div>
          <div><strong>Payor of Rent</strong></div>
          {(PAYORS as readonly string[]).map((p) => (<div key={p}>{check(form.payorOfRent === p)} {p}</div>))}
          <div style={{ marginTop: 6 }}>{field('Carrier / Other', form.payorDetail)}</div>
        </div>
        <div>
          <div><strong>Tenants</strong></div>
          {(TENANTS as readonly string[]).map((t) => (<div key={t}>{check(form.tenants.includes(t))} {t}</div>))}
        </div>
        <div>
          <div><strong>Site Type</strong></div>
          {(SITE_TYPES as readonly string[]).map((s) => (<div key={s}>{check(form.siteType === s)} {s}</div>))}
          <div style={{ marginTop: 6 }}>{field('Other', form.siteTypeDetail)}</div>
        </div>
      </div>
      <div className="doc-rule" />
      <div className="doc-grid">
        {field('Current Rent', form.currentRent)}
        {field('Rent Period', form.currentRentPeriod)}
        {field('Rent Increase Type', form.rentIncreaseType)}
        {field('Rent increase Amount', form.rentIncreaseAmount)}
        {field('Rent Escalation Date', form.rentEscalationDate)}
        {field('Lease Commencement', form.leaseCommencement)}
        {field('Lease Expiration', form.leaseExpiration)}
        {field('ROFR', form.rofr)}
        {field('Mortgage', form.mortgage)}
      </div>
      <div style={{ marginTop: 8 }}>{field('Mortgage Info', form.mortgageInfo)}</div>
      <div className="doc-rule" />
      <div className="doc-grid">
        {field('Fees %', form.feesPercent ? form.feesPercentValue || 'Yes' : '')}
        {field('Fees $', form.feesDollar ? form.feesDollarValue || 'Yes' : '')}
      </div>
      <div style={{ marginTop: 8 }}>
        <div><strong>NOTES:</strong></div>
        <div className="doc-notes">{form.notes}</div>
      </div>
    </div>
  );
}
