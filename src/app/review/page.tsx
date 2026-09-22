'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Skeleton from '@mui/material/Skeleton';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Autocomplete from '@mui/material/Autocomplete';
import InputAdornment from '@mui/material/InputAdornment';
import PrintIcon from '@mui/icons-material/Print';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import axios from 'axios';
import type { FormState } from './leadFormState';
import { EMPTY } from './leadFormDefaults';
import { LeadPrintDoc } from './LeadPrintDoc';
import { DEAL_TYPES, PAYORS, TENANTS, SITE_TYPES, RENT_PERIODS, RENT_INCREASE_TYPES, YES_NO } from '@/lib/customer-lead-form';
import { useSnackbar } from '@/components/GlobalSnackbar';

const BOOST_CONTACT = { name: 'Larry Heuchert', phone: '310-409-6614', email: 'larry@boostft.com' };

interface TowerOption {
  id: number;
  label: string;
}

interface TowerOptionState {
  options: TowerOption[];
  page: number;
  hasMore: boolean;
  loadingMore: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Keep only digits so a phone field cannot hold letters. */
const digitsOf = (v: string): string => v.replace(/\D/g, '');

/** Keep digits and a single decimal point so an amount cannot hold letters. */
const amountOf = (v: string): string => {
  const cleaned = v.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned;
  return `${cleaned.slice(0, dot + 1)}${cleaned.slice(dot + 1).replace(/\./g, '')}`;
};

/** Keep only characters that appear in a written phone number. */
const phoneOf = (v: string): string => v.replace(/[^\d+()\-\s]/g, '');

const phoneIsValid = (v: string): boolean => {
  const d = digitsOf(v).length;
  return d >= 7 && d <= 15;
};

type LeadStatus = 'draft' | 'finalized' | 'closed';
type StatusFilter = 'all' | LeadStatus;

interface StatusTone {
  bg: string;
  fg: string;
  border: string;
  label: string;
}

// Tinted chips read stronger than plain text, and every pair stays above AA contrast.
const STATUS_META: Record<LeadStatus, StatusTone> = {
  draft: { bg: '#fff4e5', fg: '#8a4b00', border: '#ffd8a8', label: 'Draft' },
  finalized: { bg: '#e7f6ec', fg: '#14532d', border: '#b7e4c7', label: 'Finalized' },
  closed: { bg: '#eef1f5', fg: '#44506b', border: '#d5dbe5', label: 'Closed' },
};

const TOTAL_TONE: StatusTone = { bg: '#e8f2fd', fg: '#0d3c61', border: '#c9e0f8', label: 'Total' };

const FILTERS: StatusFilter[] = ['all', 'draft', 'finalized', 'closed'];

const statusOf = (v: unknown): LeadStatus => (v === 'finalized' || v === 'closed' ? v : 'draft');

const asText = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

const initialsOf = (v: unknown): string => asText(v)
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((word) => word.charAt(0).toUpperCase())
  .join('');

const formatDay = (v: unknown): string => {
  const text = asText(v);
  if (!text) return '';
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? text.slice(0, 10) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

function MetricTile({ tone, value, loading }: { tone: StatusTone; value: number; loading?: boolean }) {
  return (
    <Box
      sx={{
        px: 2,
        py: 1.5,
        borderRadius: 2,
        bgcolor: tone.bg,
        border: '1px solid',
        borderColor: tone.border,
        transition: 'transform .18s ease, box-shadow .18s ease',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 6px 16px rgba(16, 24, 40, 0.08)' },
      }}
    >
      {loading ? (
        <Skeleton width={34} height={32} sx={{ bgcolor: 'rgba(16, 24, 40, 0.09)' }} />
      ) : (
        <Typography variant="h5" sx={{ fontWeight: 700, color: tone.fg, lineHeight: 1.15 }}>{value}</Typography>
      )}
      {loading ? (
        <Skeleton width={62} height={14} sx={{ bgcolor: 'rgba(16, 24, 40, 0.09)' }} />
      ) : (
        <Typography
          variant="caption"
          sx={{ color: tone.fg, opacity: 0.72, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
        >
          {tone.label}
        </Typography>
      )}
    </Box>
  );
}



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
    status: state.status || 'draft',
  };
}

function ReviewContent() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [forms, setForms] = useState<Array<{ id: number; owner: string | null; fileId: string | null; siteAddress: string | null; dealType: string | null; status: string; updatedAt?: string }>>([]);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [towerOptions, setTowerOptions] = useState<TowerOptionState>({ options: [], page: 0, hasMore: false, loadingMore: false });
  const [towerQuery, setTowerQuery] = useState('');
  const towerQueryRef = useRef('');
  const [busy, setBusy] = useState<{ id: number; action: 'open' | 'print' } | null>(null);
  const { showSnackbar } = useSnackbar();

  const set = (k: keyof FormState, v: FormState[keyof FormState]): void => {
    setForm((p) => ({ ...p, [k]: v }));
  };

  const emailError = !!form.email && !EMAIL_RE.test(form.email);
  const phoneError = !!form.phone && !phoneIsValid(form.phone);
  const percentError = !!form.feesPercentValue && Number(form.feesPercentValue) > 100;

  const fieldError = (): string | null => {
    if (emailError) return 'Enter a valid e-mail address';
    if (phoneError) return 'Enter a valid phone number';
    if (percentError) return 'Fee percent must be 100 or less';
    return null;
  };

  // Search options on the server: the tower table is too large to send at once,
  // so the list loads in pages and grows as the user scrolls to the bottom.
  const fetchTowerPage = useCallback(async (q: string, page: number): Promise<{ options: TowerOption[]; hasMore: boolean } | null> => {
    try {
      const res = await axios.get('/api/customer-lead-forms/tower-options', { params: { q, page } });
      return { options: res.data.data || [], hasMore: !!res.data.hasMore };
    } catch {
      return null;
    }
  }, []);

  const loadTowerOptions = useCallback(async (q: string): Promise<void> => {
    towerQueryRef.current = q;
    const first = await fetchTowerPage(q, 0);
    if (!first || towerQueryRef.current !== q) return;
    setTowerOptions({ options: first.options, page: 0, hasMore: first.hasMore, loadingMore: false });
  }, [fetchTowerPage]);

  const loadMoreTowerOptions = useCallback(async (): Promise<void> => {
    const q = towerQueryRef.current;
    setTowerOptions((prev) => {
      if (!prev.hasMore || prev.loadingMore) return prev;
      void (async () => {
        const next = await fetchTowerPage(q, prev.page + 1);
        if (!next || towerQueryRef.current !== q) return;
        setTowerOptions((cur) => {
          if (cur.page !== prev.page || towerQueryRef.current !== q) return cur;
          const seen = new Set(cur.options.map((o) => o.id));
          return {
            options: [...cur.options, ...next.options.filter((o) => !seen.has(o.id))],
            page: prev.page + 1,
            hasMore: next.hasMore,
            loadingMore: false,
          };
        });
      })();
      return { ...prev, loadingMore: true };
    });
  }, [fetchTowerPage]);

  useEffect(() => {
    const handle = setTimeout(() => { void loadTowerOptions(towerQuery); }, 300);
    return () => clearTimeout(handle);
  }, [towerQuery, loadTowerOptions]);

  /* Print-to-PDF save name comes from document.title: keep it unique per
     form (File ID → Tower ID → record ID) so downloads don't all land
     on "Customer Lead Form.pdf". */
  useEffect(() => {
    const prev = document.title;
    const clean = (v: string): string => v.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60);
    const tag = clean(form.fileId) || (form.towerId ? `Tower-${clean(form.towerId)}` : '')
      || (form.id ? `Form-${form.id}` : 'Draft');
    const owner = clean(form.owner);
    document.title = owner ? `Lead Form - ${tag} - ${owner}` : `Lead Form - ${tag}`;
    return () => { document.title = prev; };
  }, [form.fileId, form.towerId, form.id, form.owner]);

  const towerValue = useMemo((): TowerOption | null => {
    if (!form.towerId) return null;
    const id = Number(form.towerId);
    return towerOptions.options.find((o) => o.id === id) ?? { id, label: `Tower #${id}` };
  }, [form.towerId, towerOptions.options]);

  const towerListboxProps = {
    onScroll: (e: React.UIEvent<HTMLUListElement>): void => {
      const el = e.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) void loadMoreTowerOptions();
    },
  };

  const formTone = STATUS_META[statusOf(form.status)];

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
      notes: d.notes || '',
      status: d.status || 'draft',
    });
    setView('form');
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
          setView('form');
        }
      } catch {
        showSnackbar('Failed to load review data', 'error');
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [loadList, loadOne, searchParams, showSnackbar]);

  const save = async (): Promise<void> => {
    const invalid = fieldError();
    if (invalid) {
      showSnackbar(invalid, 'error');
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await axios.patch(`/api/customer-lead-forms/${form.id}`, toInput(form));
        showSnackbar('Form saved', 'success');
      } else {
        const res = await axios.post('/api/customer-lead-forms', toInput(form));
        setForm((p) => ({ ...p, id: res.data.id }));
        showSnackbar('Form created', 'success');
      }
      await loadList();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? ((e.response?.data?.error as string) || 'Save failed') : 'Save failed';
      showSnackbar(msg, 'error');
    } finally {
      setSaving(false);
    }
  };
  const openPrint = (): void => {
    window.print();
  };
  const openRow = useCallback(async (id: number): Promise<void> => {
    setBusy({ id, action: 'open' });
    try {
      await loadOne(id);
    } finally {
      setBusy(null);
    }
  }, [loadOne]);
  const printRow = useCallback(async (id: number): Promise<void> => {
    setBusy({ id, action: 'print' });
    try {
      await loadOne(id);
      setTimeout(() => window.print(), 150);
    } finally {
      setBusy(null);
    }
  }, [loadOne]);
  const newForm = (): void => {
    setForm(EMPTY);
    setView('form');
  };
  const backToList = (): void => {
    setView('list');
    void loadList();
  };
  const columns: GridColDef[] = useMemo(() => ([
    {
      field: 'id', headerName: 'ID', width: 84, align: 'center', headerAlign: 'center',
      renderCell: (p) => (
        <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600, color: 'text.secondary' }}>
          #{asText(p.value)}
        </Typography>
      ),
    },
    {
      field: 'owner', headerName: 'Owner', flex: 1, minWidth: 200,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
          <Box
            sx={{
              width: 28, height: 28, flexShrink: 0, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, bgcolor: 'rgba(33, 150, 243, 0.12)', color: 'primary.dark',
              fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.02em',
            }}
          >
            {initialsOf(p.value) || '?'}
          </Box>
          <Typography variant="body2" noWrap title={asText(p.value)} sx={{ minWidth: 0 }}>{asText(p.value) || 'No owner'}</Typography>
        </Box>
      ),
    },
    {
      field: 'fileId', headerName: 'File ID', width: 120,
      renderCell: (p) => <Typography variant="body2" color={asText(p.value) ? 'text.primary' : 'text.disabled'}>{asText(p.value) || '-'}</Typography>,
    },
    {
      field: 'siteAddress', headerName: 'Site address', flex: 1, minWidth: 200,
      renderCell: (p) => <Typography variant="body2" noWrap title={asText(p.value)} sx={{ minWidth: 0 }}>{asText(p.value) || '-'}</Typography>,
    },
    {
      field: 'dealType', headerName: 'Deal', width: 150,
      renderCell: (p) => (asText(p.value)
        ? <Chip label={asText(p.value)} size="small" variant="outlined" sx={{ fontWeight: 600, color: 'primary.dark', borderColor: 'rgba(33, 150, 243, 0.4)' }} />
        : <Typography variant="body2" color="text.disabled">-</Typography>),
    },
    {
      field: 'status', headerName: 'Status', width: 118, align: 'center', headerAlign: 'center',
      renderCell: (p) => {
        const tone = STATUS_META[statusOf(p.value)];
        return (
          <Chip
            label={tone.label}
            size="small"
            sx={{ bgcolor: tone.bg, color: tone.fg, border: '1px solid', borderColor: tone.border, fontWeight: 700 }}
          />
        );
      },
    },
    {
      field: 'updatedAt', headerName: 'Updated', width: 120, align: 'center', headerAlign: 'center',
      renderCell: (p) => <Typography variant="body2" color="text.secondary">{formatDay(p.value)}</Typography>,
    },
    {
      field: 'actions', headerName: 'Actions', width: 104, sortable: false, filterable: false, align: 'center', headerAlign: 'center',
      renderCell: (p) => {
        const rowId = Number(p.row.id);
        const opening = busy?.id === rowId && busy.action === 'open';
        const printing = busy?.id === rowId && busy.action === 'print';
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton
              size="small"
              title="Open"
              disabled={!!busy}
              onClick={(e) => { e.stopPropagation(); void openRow(rowId); }}
            >
              {opening ? <CircularProgress size={16} /> : <EditIcon fontSize="small" />}
            </IconButton>
            <IconButton
              size="small"
              title="Print"
              disabled={!!busy}
              onClick={(e) => { e.stopPropagation(); void printRow(rowId); }}
            >
              {printing ? <CircularProgress size={16} /> : <PrintIcon fontSize="small" />}
            </IconButton>
          </Box>
        );
      },
    },
  ]), [openRow, printRow, busy]);
  const counts = useMemo((): Record<StatusFilter, number> => ({
    all: forms.length,
    draft: forms.filter((f) => statusOf(f.status) === 'draft').length,
    finalized: forms.filter((f) => statusOf(f.status) === 'finalized').length,
    closed: forms.filter((f) => statusOf(f.status) === 'closed').length,
  }), [forms]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return forms.filter((f) => {
      if (statusFilter !== 'all' && statusOf(f.status) !== statusFilter) return false;
      if (!q) return true;
      return [f.owner, f.fileId, f.siteAddress, f.dealType, f.status, String(f.id)].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [forms, query, statusFilter]);
  return (
    <>
      <Box className="review-screen" sx={{ p: { xs: 2, md: 3 }, width: '100%', maxWidth: 1200, mx: 'auto', minWidth: 0 }}>
      {view === 'list' ? (
        <>
        <Paper
          elevation={0}
          sx={{
            position: 'relative',
            overflow: 'hidden',
            p: { xs: 2, md: 3 },
            mb: 2.5,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            background: 'radial-gradient(1100px 320px at 8% -30%, rgba(33, 150, 243, 0.16), rgba(255, 255, 255, 0) 62%), #ffffff',
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'flex-end' }, justifyContent: 'space-between', gap: 2 }}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.02em', color: '#0f172a' }}>
                Customer Lead Forms
              </Typography>
              {loading ? (
                <Skeleton width={230} height={20} sx={{ mt: 0.5 }} />
              ) : (
                <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
                  {counts.all} {counts.all === 1 ? 'record' : 'records'} in the review queue
                  {counts.draft > 0 ? ` - ${counts.draft} waiting on a draft` : ''}
                </Typography>
              )}
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: 'stretch' }}>
              <TextField
                size="small"
                placeholder="Search owner, file, address"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                sx={{ minWidth: { sm: 280 } }}
                InputProps={{
                  startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment>),
                  endAdornment: query
                    ? (<InputAdornment position="end"><IconButton size="small" title="Clear search" onClick={() => setQuery('')}><CloseIcon fontSize="small" /></IconButton></InputAdornment>)
                    : null,
                }}
              />
              <Button variant="contained" startIcon={<AddIcon />} onClick={newForm} sx={{ whiteSpace: 'nowrap', boxShadow: 'none' }}>
                Create new
              </Button>
            </Stack>
          </Box>
          <Box sx={{ display: 'grid', gap: 1.5, mt: 2.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' } }}>
            <MetricTile tone={TOTAL_TONE} value={counts.all} loading={loading} />
            <MetricTile tone={STATUS_META.draft} value={counts.draft} loading={loading} />
            <MetricTile tone={STATUS_META.finalized} value={counts.finalized} loading={loading} />
            <MetricTile tone={STATUS_META.closed} value={counts.closed} loading={loading} />
          </Box>
        </Paper>
        <Paper
          elevation={0}
          sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden', boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#fbfcfe' }}>
            {loading ? (
              FILTERS.map((key) => <Skeleton key={key} variant="rounded" width={92} height={24} />)
            ) : (
              FILTERS.map((key) => {
              const active = statusFilter === key;
              const tone = key === 'all' ? TOTAL_TONE : STATUS_META[key];
              return (
                <Chip
                  key={key}
                  label={`${tone.label} ${counts[key]}`}
                  size="small"
                  onClick={() => setStatusFilter(key)}
                  sx={{
                    fontWeight: 700,
                    bgcolor: active ? tone.bg : 'transparent',
                    color: active ? tone.fg : 'text.secondary',
                    border: '1px solid',
                    borderColor: active ? tone.border : 'divider',
                    '&:hover': { bgcolor: tone.bg },
                  }}
                />
              );
            }))}
            {loading ? (
              <Skeleton width={58} height={16} sx={{ ml: 'auto' }} />
            ) : (
              <Typography variant="caption" sx={{ ml: 'auto', color: 'text.secondary' }}>
                {filtered.length} shown
              </Typography>
            )}
          </Box>
          {!loading && filtered.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', px: 3, py: 7, gap: 1 }}>
              <Box sx={{ width: 56, height: 56, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'rgba(33, 150, 243, 0.10)', color: 'primary.dark', mb: 0.5 }}>
                <DescriptionIcon />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {counts.all === 0 ? 'No lead forms yet' : 'No records match this filter'}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 420 }}>
                {counts.all === 0
                  ? 'Create the first customer lead form to start the review queue.'
                  : 'Clear the search box or pick another status to see more records.'}
              </Typography>
              {counts.all === 0 && (
                <Button variant="contained" startIcon={<AddIcon />} onClick={newForm} sx={{ mt: 1.5, boxShadow: 'none' }}>
                  Create new form
                </Button>
              )}
            </Box>
          ) : (
            <DataGrid
              rows={filtered}
              columns={columns}
              loading={loading}
              autoHeight
              disableColumnMenu
              onRowClick={(p) => void openRow(Number(p.row.id))}
              initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
              pageSizeOptions={[10, 25, 50]}
              disableRowSelectionOnClick
              rowHeight={56}
              columnHeaderHeight={48}
              sx={{
                border: 0,
                '& .MuiDataGrid-columnHeaders': { bgcolor: '#f7f9fc', borderBottom: '1px solid', borderColor: 'divider' },
                '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' },
                '& .MuiDataGrid-columnSeparator': { display: 'none' },
                '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', borderColor: 'rgba(16, 24, 40, 0.06)' },
                '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
                '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': { outline: 'none' },
                '& .MuiDataGrid-row:hover': { bgcolor: 'rgba(33, 150, 243, 0.04)', cursor: 'pointer' },
                '& .MuiDataGrid-footerContainer': { borderTop: '1px solid', borderColor: 'divider' },
              }}
            />
          )}
        </Paper>
        </>
      ) : loading ? (
        <Paper
          elevation={0}
          sx={{ p: { xs: 2, md: 3 }, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <CircularProgress size={18} />
            <Skeleton width={180} height={20} />
          </Box>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={56} />
            ))}
          </Box>
        </Paper>
      ) : (
        <>
      <Box
        className="no-print"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 3,
          display: 'flex',
          gap: 1,
          mb: 2,
          px: { xs: 1.5, md: 2 },
          py: 1.25,
          flexWrap: 'wrap',
          alignItems: 'center',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'rgba(255, 255, 255, 0.86)',
          backdropFilter: 'saturate(180%) blur(8px)',
          WebkitBackdropFilter: 'saturate(180%) blur(8px)',
          boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)',
        }}
      >
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={backToList}>Back to records</Button>
        <Box sx={{ mr: 'auto', display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
            {form.id ? `Lead form #${form.id}` : 'New lead form'}
          </Typography>
          <Chip
            label={formTone.label}
            size="small"
            sx={{ bgcolor: formTone.bg, color: formTone.fg, border: '1px solid', borderColor: formTone.border, fontWeight: 700 }}
          />
        </Box>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={save}
          disabled={saving}
          sx={{ boxShadow: 'none' }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <Button variant="outlined" startIcon={<PrintIcon />} onClick={openPrint}>Print</Button>
        <Button variant="text" onClick={newForm}>New form</Button>
        <TextField select label="Status" size="small" value={form.status} onChange={(e) => set('status', e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="draft">{STATUS_META.draft.label}</MenuItem>
          <MenuItem value="finalized">{STATUS_META.finalized.label}</MenuItem>
          <MenuItem value="closed">{STATUS_META.closed.label}</MenuItem>
        </TextField>
      </Box>
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
        <Box sx={{ display: "grid", gap: 2, alignItems: "start", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } }}>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Call Date" type="date" InputLabelProps={{ shrink: true }} value={form.callDate} onChange={(e) => set('callDate', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Source" value={form.source} onChange={(e) => set('source', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="File ID" value={form.fileId} onChange={(e) => set('fileId', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Owner" value={form.owner} onChange={(e) => set('owner', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}>
            <TextField
              fullWidth
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', phoneOf(e.target.value))}
              error={phoneError}
              helperText={phoneError ? 'Enter 7 to 15 digits' : ' '}
            />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Autocomplete
              options={towerOptions.options}
              value={towerValue}
              onChange={(_e, v) => set('towerId', v ? String(v.id) : '')}
              onInputChange={(_e, v, reason) => { if (reason === 'input') setTowerQuery(v); }}
              filterOptions={(x) => x}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              getOptionLabel={(o) => `#${o.id} - ${o.label}`}
              noOptionsText={towerOptions.loadingMore ? 'Loading more towers...' : 'No tower matches'}
              loading={towerOptions.loadingMore}
              loadingText="Loading more towers..."
              ListboxProps={towerListboxProps}
              renderInput={(p) => <TextField {...p} label="Tower ID" helperText={towerOptions.hasMore ? 'Scroll for more matches' : 'Search by id, address, or owner'} />}
            />
          </Box>
          <Box sx={{ minWidth: 0 }}><TextField fullWidth label="Contact" value={form.contact} onChange={(e) => set('contact', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0 }}>
            <TextField
              fullWidth
              label="E-mail"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value.trim())}
              error={emailError}
              helperText={emailError ? 'Enter a valid e-mail address' : ' '}
            />
          </Box>
          <Box sx={{ minWidth: 0, gridColumn: "1 / -1" }}><TextField fullWidth multiline minRows={2} label="Mailing Address" value={form.mailingAddress} onChange={(e) => set('mailingAddress', e.target.value)} /></Box>
          <Box sx={{ minWidth: 0, gridColumn: "1 / -1" }}><TextField fullWidth multiline minRows={2} label="Site Address" value={form.siteAddress} onChange={(e) => set('siteAddress', e.target.value)} /></Box>
        </Box>
        <Divider sx={{ my: 2 }} />
        <Box sx={{ display: "grid", gap: 2, alignItems: "start", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } }}>
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
        <Box sx={{ display: "grid", gap: 2, alignItems: "start", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } }}>
          <Box sx={{ minWidth: 0 }}>
            <TextField
              fullWidth
              label="Current Rent"
              inputProps={{ inputMode: 'decimal' }}
              value={form.currentRent}
              onChange={(e) => set('currentRent', amountOf(e.target.value))}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              helperText={form.currentRentPeriod ? `Per ${form.currentRentPeriod.toLowerCase()}` : ' '}
            />
          </Box>
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
          <Box sx={{ minWidth: 0 }}>
            <TextField
              fullWidth
              label="Rent increase Amount"
              inputProps={{ inputMode: 'decimal' }}
              value={form.rentIncreaseAmount}
              onChange={(e) => set('rentIncreaseAmount', amountOf(e.target.value))}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              helperText=" "
            />
          </Box>
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
        <Box sx={{ display: "grid", gap: 2, alignItems: "start", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" } }}>
          <Box sx={{ minWidth: 0 }}>
            <FormControlLabel control={<Checkbox checked={form.feesPercent} onChange={(e) => set('feesPercent', e.target.checked)} />} label="Fees %" />
            <TextField
              fullWidth
              label="Fee percent value"
              inputProps={{ inputMode: 'decimal' }}
              value={form.feesPercentValue}
              onChange={(e) => set('feesPercentValue', amountOf(e.target.value))}
              error={percentError}
              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
              helperText={percentError ? 'Enter 100 or less' : ' '}
            />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <FormControlLabel control={<Checkbox checked={form.feesDollar} onChange={(e) => set('feesDollar', e.target.checked)} />} label="Fees $" />
            <TextField
              fullWidth
              label="Fee dollar value"
              inputProps={{ inputMode: 'decimal' }}
              value={form.feesDollarValue}
              onChange={(e) => set('feesDollarValue', amountOf(e.target.value))}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              helperText=" "
            />
          </Box>
          <Box sx={{ minWidth: 0, gridColumn: "1 / -1" }}><TextField fullWidth multiline minRows={4} label="NOTES" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Box>
        </Box>
      </Paper>
        </>
      )}
      </Box>
      <LeadPrintDoc form={form} />
    </>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<Box sx={{ p: 4 }}><CircularProgress /></Box>}>
      <ReviewContent />
    </Suspense>
  );
}




