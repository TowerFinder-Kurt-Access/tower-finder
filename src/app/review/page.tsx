'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import PrintIcon from '@mui/icons-material/Print';
import SaveIcon from '@mui/icons-material/Save';
import axios from 'axios';
import type { FormState } from './leadFormState';
import { EMPTY } from './leadFormDefaults';
import { LeadPrintDoc } from './LeadPrintDoc';
import { DEAL_TYPES, PAYORS, TENANTS, SITE_TYPES, RENT_PERIODS, RENT_INCREASE_TYPES, YES_NO } from '@/lib/customer-lead-form';

const BOOST_CONTACT = { name: 'Larry Heuchert', phone: '310-409-6614', email: 'larry@boostft.com' };



function toInput(state: FormState): Record<string, unknown> {
  const num = (v: string): number | null => (v === '' ? null : Number(v));
  return {
    dealType: state.dealType || null,
    callDate: state.callDate || null,
    source: state.source || null,
    fileId: state.fileId || null,
    owner: state.owner || null,
    phone: state.phone || null,
    contact: state.contact || null,
    email: state.email || null,
    mailingAddress: state.mailingAddress || null,
    siteAddress: state.siteAddress || null,
    towerId: state.towerId ? Number(state.towerId) : null,
    payorOfRent: state.payorOfRent || null,
    payorDetail: state.payorDetail || null,
    tenants: state.tenants,
    siteType: state.siteType || null,
    siteTypeDetail: state.siteTypeDetail || null,
    currentRent: num(state.currentRent),
    currentRentPeriod: state.currentRentPeriod || null,
    rentIncreaseType: state.rentIncreaseType || null,
    rentIncreaseAmount: state.rentIncreaseAmount || null,
    leaseCommencement: state.leaseCommencement || null,
    leaseExpiration: state.leaseExpiration || null,
    rentEscalationDate: state.rentEscalationDate || null,
    rofr: state.rofr || null,
    mortgage: state.mortgage || null,
    mortgageInfo: state.mortgageInfo || null,
    feesPercent: state.feesPercent,
    feesPercentValue: num(state.feesPercentValue),
    feesDollar: state.feesDollar,
    feesDollarValue: num(state.feesDollarValue),
    notes: state.notes || null,
    agreedItems: state.agreedItems,
    brettConfirmed: state.brettConfirmed,
    brettConfirmedBy: state.brettConfirmedBy || null,
    larryCallNotes: state.larryCallNotes || null,
    larryComments: state.larryComments || null,
    adminSignName: state.adminSignName || null,
    larrySignName: state.larrySignName || null,
    status: state.status || 'draft',
  };
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<Box sx={{ p: 4 }}><CircularProgress /></Box>}>
      <ReviewContent />
    </Suspense>
  );
}

function ReviewContent() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [forms, setForms] = useState<Array<{ id: number; owner: string | null; fileId: string | null; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const set = (k: keyof FormState, v: FormState[keyof FormState]): void => {
    setForm((p) => ({ ...p, [k]: v }));
  };

  const loadList = useCallback(async (): Promise<void> => {
    const res = await axios.get('/api/customer-lead-forms');
    setForms(res.data.data || []);
  }, []);

  const loadOne = useCallback(async (id: number): Promise<void> => {
    const res = await axios.get(`/api/customer-lead-forms/${id}`);
    const d = res.data;
    const date = (v: string | null): string => (v ? v.slice(0, 10) : '');
    setForm({
      ...EMPTY,
      id: d.id,
      dealType: d.dealType || '', callDate: date(d.callDate), source: d.source || '',
      fileId: d.fileId || '', owner: d.owner || '', phone: d.phone || '',
      contact: d.contact || '', email: d.email || '', mailingAddress: d.mailingAddress || '',
      siteAddress: d.siteAddress || '', towerId: d.towerId ? String(d.towerId) : '',
      payorOfRent: d.payorOfRent || '', payorDetail: d.payorDetail || '',
      tenants: d.tenants || [], siteType: d.siteType || '', siteTypeDetail: d.siteTypeDetail || '',
      currentRent: d.currentRent != null ? String(d.currentRent) : '',
      currentRentPeriod: d.currentRentPeriod || '', rentIncreaseType: d.rentIncreaseType || '',
      rentIncreaseAmount: d.rentIncreaseAmount || '', leaseCommencement: date(d.leaseCommencement),
      leaseExpiration: date(d.leaseExpiration), rentEscalationDate: date(d.rentEscalationDate),
      rofr: d.rofr || '', mortgage: d.mortgage || '', mortgageInfo: d.mortgageInfo || '',
      feesPercent: !!d.feesPercent, feesPercentValue: d.feesPercentValue != null ? String(d.feesPercentValue) : '',
      feesDollar: !!d.feesDollar, feesDollarValue: d.feesDollarValue != null ? String(d.feesDollarValue) : '',
      notes: d.notes || '', agreedItems: (d.agreedItems as Record<string, boolean>) || {},
      brettConfirmed: !!d.brettConfirmed, brettConfirmedBy: d.brettConfirmedBy || '',
      larryCallNotes: d.larryCallNotes || '', larryComments: d.larryComments || '',
      adminSignName: d.adminSignName || '', larrySignName: d.larrySignName || '',
      status: d.status || 'draft',
    });
  }, []);
  useEffect(() => {
    const init = async (): Promise<void> => {
      try {
        await loadList();
        const id = searchParams.get('id');
        const towerId = searchParams.get('towerId');
        if (id) {
          await loadOne(Number(id));
        } else if (towerId) {
          const pre = await axios.get(`/api/customer-lead-forms/prefill?towerId=${towerId}`);
          setForm({ ...EMPTY, towerId, owner: pre.data.owner || '', phone: pre.data.phone || '', contact: pre.data.contact || '', email: pre.data.email || '', mailingAddress: pre.data.mailingAddress || '', siteAddress: pre.data.siteAddress || '', source: pre.data.source || '' });
        }
      } catch {
        setMessage({ type: 'error', text: 'Failed to load review data' });
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [loadList, loadOne, searchParams]);

  const save = async (): Promise<void> => {
    setSaving(true);
    setMessage(null);
    try {
      if (form.id) {
        await axios.patch(`/api/customer-lead-forms/${form.id}`, toInput(form));
        setMessage({ type: 'success', text: 'Form saved' });
      } else {
        const res = await axios.post('/api/customer-lead-forms', toInput(form));
        setForm((p) => ({ ...p, id: res.data.id }));
        setMessage({ type: 'success', text: 'Form created' });
      }
      await loadList();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? ((e.response?.data?.error as string) || 'Save failed') : 'Save failed';
      setMessage({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };
  const openPrint = (): void => {
    window.print();
  };
  if (loading) {
    return (<Box sx={{ p: 4 }}><CircularProgress /></Box>);
  }

  return (
    <>
      <Box className="review-screen" sx={{ p: { xs: 2, md: 3 }, width: '100%', maxWidth: 1100, mx: 'auto', minWidth: 0 }}>
      <Box className="no-print" sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving}>Submit</Button>
        <Button variant="outlined" startIcon={<PrintIcon />} onClick={openPrint}>Print</Button>
        <Button variant="text" onClick={() => setForm(EMPTY)}>New form</Button>
        <TextField select label="Open saved" size="small" value={form.id || ''} onChange={(e) => { if (e.target.value) void loadOne(Number(e.target.value)); }} sx={{ minWidth: 220 }}>
          <MenuItem value="">Select</MenuItem>
          {forms.map((f) => (<MenuItem key={f.id} value={f.id}>#{f.id} {f.owner || f.fileId || f.status}</MenuItem>))}
        </TextField>
        <TextField select label="Status" size="small" value={form.status} onChange={(e) => set('status', e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="draft">draft</MenuItem>
          <MenuItem value="finalized">finalized</MenuItem>
          <MenuItem value="closed">closed</MenuItem>
        </TextField>
      </Box>
      {message && (<Alert className="no-print" severity={message.type} sx={{ mb: 2 }}>{message.text}</Alert>)}
      <Paper sx={{ p: { xs: 2, md: 3 }, minWidth: 0, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            {(DEAL_TYPES as readonly string[]).map((d) => (
              <FormControlLabel key={d} control={<Checkbox checked={form.dealType === d} onChange={() => set('dealType', d)} />} label={d} />
            ))}
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="subtitle2">{BOOST_CONTACT.name}</Typography>
            <Typography variant="body2">{BOOST_CONTACT.phone}</Typography>
            <Typography variant="body2">{BOOST_CONTACT.email}</Typography>
          </Box>
        </Box>
        <Divider sx={{ my: 2 }} />
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } }}>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Call Date" type="date" InputLabelProps={{ shrink: true }} value={form.callDate} onChange={(e) => set('callDate', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Source" value={form.source} onChange={(e) => set('source', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="File ID" value={form.fileId} onChange={(e) => set('fileId', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Owner" value={form.owner} onChange={(e) => set('owner', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Tower ID" value={form.towerId} onChange={(e) => set('towerId', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Contact" value={form.contact} onChange={(e) => set('contact', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="E-mail" value={form.email} onChange={(e) => set('email', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0, gridColumn: "1 / -1" }}><TextField fullWidth multiline minRows={2} label="Mailing Address" value={form.mailingAddress} onChange={(e) => set('mailingAddress', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0, gridColumn: "1 / -1" }}><TextField fullWidth multiline minRows={2} label="Site Address" value={form.siteAddress} onChange={(e) => set('siteAddress', e.target.value)} /></Box>
        </Box>
        <Divider sx={{ my: 2 }} />
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } }}>
          <Box sx={{ minWidth: 0, gridColumn: { xs: '1 / -1', lg: 'auto' } }}>
            <Typography variant="subtitle2">Payor of Rent</Typography>
            {(PAYORS as readonly string[]).map((p) => (
              <FormControlLabel sx={{ mr: 1 }} key={p} control={<Checkbox checked={form.payorOfRent === p} onChange={() => set('payorOfRent', p)} />} label={p} />
            ))}
            <TextField fullWidth size="small" label="Carrier detail" value={form.payorDetail} onChange={(e) => set('payorDetail', e.target.value)} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2">Tenants</Typography>
            <FormGroup sx={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
              {(TENANTS as readonly string[]).map((t) => (
                <FormControlLabel key={t} control={<Checkbox checked={form.tenants.includes(t)} onChange={() => set('tenants', form.tenants.includes(t) ? form.tenants.filter((x) => x !== t) : [...form.tenants, t])} />} label={t} />
              ))}
            </FormGroup>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2">Site Type</Typography>
            {(SITE_TYPES as readonly string[]).map((s) => (
              <FormControlLabel key={s} control={<Checkbox checked={form.siteType === s} onChange={() => set('siteType', s)} />} label={s} />
            ))}
            <TextField fullWidth size="small" label="Other detail" value={form.siteTypeDetail} onChange={(e) => set('siteTypeDetail', e.target.value)} />
          </Box>
        </Box>
        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } }}>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Current Rent" value={form.currentRent} onChange={(e) => set('currentRent', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2">Rent Period</Typography>
            {(RENT_PERIODS as readonly string[]).map((r) => (
              <FormControlLabel key={r} control={<Checkbox checked={form.currentRentPeriod === r} onChange={() => set('currentRentPeriod', r)} />} label={r} />
            ))}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2">Rent Increase Type</Typography>
            {(RENT_INCREASE_TYPES as readonly string[]).map((r) => (
              <FormControlLabel key={r} control={<Checkbox checked={form.rentIncreaseType === r} onChange={() => set('rentIncreaseType', r)} />} label={r} />
            ))}
          </Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Rent increase Amount" value={form.rentIncreaseAmount} onChange={(e) => set('rentIncreaseAmount', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Rent Escalation Date" type="date" InputLabelProps={{ shrink: true }} value={form.rentEscalationDate} onChange={(e) => set('rentEscalationDate', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Lease Commencement" type="date" InputLabelProps={{ shrink: true }} value={form.leaseCommencement} onChange={(e) => set('leaseCommencement', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Lease Expiration" type="date" InputLabelProps={{ shrink: true }} value={form.leaseExpiration} onChange={(e) => set('leaseExpiration', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2">ROFR?</Typography>
            <RadioGroup row value={form.rofr} onChange={(e) => set('rofr', e.target.value)}>
              {(YES_NO as readonly string[]).map((v) => (<FormControlLabel key={v} value={v} control={<Radio />} label={v} />))}
            </RadioGroup>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2">Mortgage?</Typography>
            <RadioGroup row value={form.mortgage} onChange={(e) => set('mortgage', e.target.value)}>
              {(YES_NO as readonly string[]).map((v) => (<FormControlLabel key={v} value={v} control={<Radio />} label={v} />))}
            </RadioGroup>
          </Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Mortgage Info" value={form.mortgageInfo} onChange={(e) => set('mortgageInfo', e.target.value)} /></Box>
        </Box>
        <Divider sx={{ my: 2 }} />
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } }}>
          <Box sx={{ minWidth: 0 }}>
            <FormControlLabel control={<Checkbox checked={form.feesPercent} onChange={(e) => set('feesPercent', e.target.checked)} />} label="Fees %" />
            <TextField fullWidth label="Fee percent value" value={form.feesPercentValue} onChange={(e) => set('feesPercentValue', e.target.value)} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <FormControlLabel control={<Checkbox checked={form.feesDollar} onChange={(e) => set('feesDollar', e.target.checked)} />} label="Fees $" />
            <TextField fullWidth label="Fee dollar value" value={form.feesDollarValue} onChange={(e) => set('feesDollarValue', e.target.value)} />
          </Box>
          <Box sx={{ minWidth: 0, gridColumn: "1 / -1" }}><TextField fullWidth multiline minRows={4} label="NOTES" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Box>
        </Box>
      </Paper>
      </Box>
      <LeadPrintDoc form={form} />
    </>
  );
}




