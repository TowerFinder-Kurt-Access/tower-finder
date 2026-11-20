'use client';

import { useRef, useState } from 'react';
import {
    Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, LinearProgress, Stack, Tab, Tabs, Table, TableBody, TableCell, TableHead, TableRow,
    Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import axios from 'axios';
import { TEMPLATE_COLUMNS, type ImportCountry } from '@/lib/tower-csv-import';

interface ImportError { row: number; message: string }
interface ImportRegion { country: string; province: string; count: number }

interface ImportPreview {
    totalRows: number;
    validCount: number;
    errorCount: number;
    errors: ImportError[];
    regions?: ImportRegion[];
    created?: number;
    updated?: number;
}

interface ImportTowersDialogProps {
    open: boolean;
    onClose: () => void;
    onImported: () => void;
}

type Step = 'setup' | 'file' | 'region' | 'done';

const COUNTRY_TABS: { country: ImportCountry; label: string; hint: string }[] = [
    { country: 'USA', label: 'USA', hint: 'State, 5-digit ZIP, county' },
    { country: 'Canada', label: 'Canada', hint: 'Province, A1A 1A1 postal code, census division' },
];

export default function ImportTowersDialog({ open, onClose, onImported }: ImportTowersDialogProps) {
    const [step, setStep] = useState<Step>('setup');
    const [country, setCountry] = useState<ImportCountry | ''>('');
    const [fileName, setFileName] = useState('');
    const [csv, setCsv] = useState('');
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [result, setResult] = useState<ImportPreview | null>(null);
    const [regionConfirmed, setRegionConfirmed] = useState(false);
    const [dataConfirmed, setDataConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const reset = () => {
        setStep('setup');
        setCountry('');
        setFileName('');
        setCsv('');
        setPreview(null);
        setResult(null);
        setRegionConfirmed(false);
        setDataConfirmed(false);
        setBusy(false);
        setProgress(0);
        setDragging(false);
        setError('');
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    /** The workbook comes from the API so ExcelJS stays server-side. */
    const downloadTemplate = async () => {
        if (!country) return;
        try {
            const response = await axios.get(`/api/towers/import/template?country=${country}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `towers-${country.toLowerCase()}-template.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err: unknown) {
            setError(axios.isAxiosError(err) ? (err.response?.data?.error ?? 'Could not build the template') : 'Could not build the template');
        }
    };

    const loadFile = async (file: File) => {
        if (!country) {
            setError('Pick the import region first');
            return;
        }
        setError('');
        setPreview(null);
        setResult(null);
        setRegionConfirmed(false);
        setDataConfirmed(false);
        if (!/\.csv$/i.test(file.name)) {
            setError('Choose a .csv file');
            return;
        }
        const text = await file.text();
        setFileName(file.name);
        setCsv(text);
        setBusy(true);
        try {
            const response = await axios.post('/api/towers/import', { csv: text, country });
            setPreview(response.data);
        } catch (err: unknown) {
            setError(axios.isAxiosError(err) ? (err.response?.data?.error ?? 'Could not read the file') : 'Could not read the file');
        } finally {
            setBusy(false);
        }
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void loadFile(file);
    };

    const handleCommit = async () => {
        setBusy(true);
        setError('');
        setProgress(0);
        // Address geocoding is the slow part; the bar advances on its own and
        // snaps to done when the request returns.
        const timer = setInterval(() => {
            setProgress((value) => (value >= 90 ? 90 : value + 3));
        }, 400);
        try {
            const response = await axios.post('/api/towers/import', { csv, country, commit: true });
            setProgress(100);
            setResult(response.data);
            setStep('done');
            if ((response.data.created ?? 0) + (response.data.updated ?? 0) > 0) onImported();
        } catch (err: unknown) {
            setError(axios.isAxiosError(err) ? (err.response?.data?.error ?? 'Import failed') : 'Import failed');
        } finally {
            clearInterval(timer);
            setBusy(false);
        }
    };

    const startOver = () => {
        setFileName('');
        setCsv('');
        setPreview(null);
        setResult(null);
        setRegionConfirmed(false);
        setDataConfirmed(false);
        setError('');
        setStep('file');
    };

    const shownErrors = result?.errors ?? preview?.errors ?? [];
    const regions = result?.regions ?? preview?.regions ?? [];
    const validCount = preview?.validCount ?? 0;
    const regionLabel = regions.map((region) => region.province).join(', ');

    const regionTable = (
        <Table size="small">
            <TableHead>
                <TableRow>
                    <TableCell>Country</TableCell>
                    <TableCell>State / Province</TableCell>
                    <TableCell align="right">Rows</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {regions.map((region) => (
                    <TableRow key={`${region.country}-${region.province}`}>
                        <TableCell>{region.country}</TableCell>
                        <TableCell>{region.province}</TableCell>
                        <TableCell align="right">{region.count}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );

    const errorsBox = shownErrors.length > 0 && (
        <Box sx={{ maxHeight: 200, overflowY: 'auto', bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>
            {shownErrors.slice(0, 200).map((entry) => (
                <Typography key={`${entry.row}-${entry.message}`} variant="body2" sx={{ mb: 0.5 }}>
                    {entry.row > 0 ? `Row ${entry.row}: ` : ''}{entry.message}
                </Typography>
            ))}
            {shownErrors.length > 200 && (
                <Typography variant="body2" color="text.secondary">And {shownErrors.length - 200} more rows.</Typography>
            )}
        </Box>
    );

    const setupStep = (
        <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
                Choose the region first. The file is checked against that region only, so a US state in a Canada
                import is rejected instead of quietly landing in the wrong list.
            </Typography>

            <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Import Region</Typography>
                <Tabs
                    value={country || false}
                    onChange={(_event, value: ImportCountry) => {
                        setCountry(value);
                        setPreview(null);
                        setFileName('');
                        setCsv('');
                        setError('');
                    }}
                    aria-label="Import region"
                    sx={{ minHeight: 40, borderBottom: 1, borderColor: 'divider' }}
                >
                    {COUNTRY_TABS.map((tab) => (
                        <Tab key={tab.country} value={tab.country} label={tab.label} sx={{ textTransform: 'none', minHeight: 40 }} />
                    ))}
                </Tabs>
            </Box>
            <Typography variant="caption" color="text.secondary">
                {COUNTRY_TABS.find((tab) => tab.country === country)?.hint
                    ?? 'Pick a region. The file is checked against that region only.'}
            </Typography>

            <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Required columns</Typography>
                <Typography variant="body2" color="text.secondary">
                    Address, City, County, State, ZIP. Latitude and Longitude are not columns: the importer
                    geocodes each address.
                </Typography>
            </Box>

            <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Optional columns</Typography>
                <Typography variant="body2" color="text.secondary">
                    Type, Owner Name, Contact Person, Notes, Lease Expiry. Each one is stored when the cell has a value.
                    Business counts come from the nightly job, so the file cannot set them.
                </Typography>
            </Box>

            <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Excel Template</Typography>
                <Button
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={() => void downloadTemplate()}
                    disabled={!country}
                    sx={{ textTransform: 'none' }}
                >
                    Download Excel Template
                </Button>
                <Typography variant="caption" display="block" sx={{ mt: 0.5, color: 'text.secondary' }}>
                    Columns: {TEMPLATE_COLUMNS.join(', ')}
                </Typography>
            </Box>
            <Alert severity="info">
                The Excel workbook is a template only. Save it as CSV before you import: File &gt; Download &gt;
                Comma-separated values in Google Sheets, or File &gt; Save As &gt; CSV in Excel. This dialog accepts
                .csv files only.
            </Alert>

            {error && <Alert severity="error">{error}</Alert>}
        </Stack>
    );

    const fileStep = (
        <Stack spacing={2}>
            <Alert severity="info">
                Importing {country} rows. Each address is geocoded, so a row with a bad address fails instead of
                landing on a guessed point.
            </Alert>

            <Box
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                sx={{
                    border: '2px dashed',
                    borderColor: dragging ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    p: 4,
                    textAlign: 'center',
                    cursor: 'pointer',
                    bgcolor: dragging ? 'action.hover' : 'transparent',
                }}
            >
                <CloudUploadIcon color="action" sx={{ fontSize: 40 }} />
                <Typography variant="body1" sx={{ mt: 1 }}>
                    {fileName || 'Drag a .csv file here, or click to choose one'}
                </Typography>
                <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv"
                    hidden
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void loadFile(file);
                        event.target.value = '';
                    }}
                />
            </Box>

            {busy && <LinearProgress />}
            {error && <Alert severity="error">{error}</Alert>}

            {preview && (
                <Alert severity={preview.errorCount > 0 ? 'warning' : 'success'}>
                    {preview.validCount} of {preview.totalRows} rows are valid. {preview.errorCount} rows cannot be imported.
                </Alert>
            )}
            {errorsBox}
        </Stack>
    );

    const regionStep = (
        <Stack spacing={2}>
            <Alert severity="warning">
                These {validCount} rows go into {regions.length === 1 ? 'one region' : `${regions.length} regions`}. Check the list before you import.
            </Alert>
            {regionTable}
            <Typography variant="body2" color="text.secondary">
                {preview?.errorCount ?? 0} rows with errors will be skipped.
            </Typography>
            <FormControlLabel
                control={<Checkbox checked={regionConfirmed} onChange={(event) => setRegionConfirmed(event.target.checked)} />}
                label={`I confirm these ${country} rows belong to ${regionLabel || 'the regions above'}.`}
            />
            {busy && (
                <Box>
                    <LinearProgress variant="determinate" value={progress} />
                    <Typography variant="caption" color="text.secondary">
                        Geocoding addresses and saving rows...
                    </Typography>
                </Box>
            )}
        </Stack>
    );

    const doneStep = (
        <Stack spacing={2}>
            <Alert severity={((result?.errorCount ?? 0) > 0) ? 'warning' : 'success'}>
                Created {result?.created ?? 0}, updated {result?.updated ?? 0}, skipped {result?.errorCount ?? 0} of {result?.totalRows ?? 0} rows.
            </Alert>
            {regionTable}
            {errorsBox}

            <Typography variant="subtitle2">Is this the correct data?</Typography>
            <Typography variant="body2" color="text.secondary">
                The rows in the table are already saved. Re-importing the same address updates that tower, so a
                corrected file fixes the data. Business counts fill in on the next nightly run.
            </Typography>

            <FormControlLabel
                control={<Checkbox checked={dataConfirmed} onChange={(event) => setDataConfirmed(event.target.checked)} />}
                label="I checked the region, row count and skipped rows above. This is the correct data."
            />
        </Stack>
    );

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>
                {step === 'setup' && 'Import Towers from CSV'}
                {step === 'file' && `Import ${country} Towers`}
                {step === 'region' && 'Confirm the Import Region'}
                {step === 'done' && 'Confirm the Imported Data'}
            </DialogTitle>
            <DialogContent dividers>
                {step === 'setup' && setupStep}
                {step === 'file' && fileStep}
                {step === 'region' && regionStep}
                {step === 'done' && doneStep}
            </DialogContent>
            <DialogActions>
                {step === 'setup' && (
                    <>
                        <Button onClick={handleClose} sx={{ textTransform: 'none' }}>Cancel</Button>
                        <Button
                            variant="contained"
                            onClick={() => setStep('file')}
                            disabled={!country}
                            sx={{ textTransform: 'none' }}
                        >
                            Continue
                        </Button>
                    </>
                )}
                {step === 'file' && (
                    <>
                        <Button onClick={() => setStep('setup')} disabled={busy} sx={{ textTransform: 'none' }}>Back</Button>
                        <Button
                            variant="contained"
                            onClick={() => setStep('region')}
                            disabled={busy || !preview || validCount === 0}
                            sx={{ textTransform: 'none' }}
                        >
                            Continue ({validCount} Rows)
                        </Button>
                    </>
                )}
                {step === 'region' && (
                    <>
                        <Button onClick={() => setStep('file')} disabled={busy} sx={{ textTransform: 'none' }}>Back</Button>
                        <Button
                            variant="contained"
                            color="warning"
                            onClick={handleCommit}
                            disabled={busy || !regionConfirmed}
                            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
                            sx={{ textTransform: 'none' }}
                        >
                            {busy ? 'Importing...' : `Import ${validCount} Rows`}
                        </Button>
                    </>
                )}
                {step === 'done' && (
                    <>
                        <Button onClick={startOver} sx={{ textTransform: 'none' }}>Import a Corrected File</Button>
                        <Button
                            variant="contained"
                            onClick={handleClose}
                            disabled={!dataConfirmed}
                            sx={{ textTransform: 'none' }}
                        >
                            Yes, This Is Correct
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
}
