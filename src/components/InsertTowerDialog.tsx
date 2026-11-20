'use client';

import { useEffect, useState } from 'react';
import {
    Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, Stack, Tab, Tabs, TextField, Typography, Checkbox,
} from '@mui/material';
import axios from 'axios';
import { COUNTRY_TABS, type ImportCountry } from '@/lib/tower-import-fields';
import { useCountry } from '@/lib/country-context';
import { useSnackbar } from '@/components/GlobalSnackbar';

interface InsertTowerDialogProps {
    open: boolean;
    onClose: () => void;
    onInserted: () => void;
}

const BLANK = {
    Address: '', City: '', County: '', State: '', ZIP: '',
    Type: '', 'Owner Name': '', 'Contact Person': '', Notes: '', 'Lease Expiry': '',
};

type Fields = typeof BLANK;

/**
 * Adds one tower by hand. The region comes first because it decides the allowed
 * state and postal format; the fields then mirror the import columns, so both
 * paths produce the same record.
 */
export default function InsertTowerDialog({ open, onClose, onInserted }: InsertTowerDialogProps) {
    // The sidebar region is already chosen, so the dialog opens on that tab
    // instead of asking the user to pick the same thing twice. `picked` holds an
    // explicit choice made here; without one the sidebar value wins.
    const { country: sidebarCountry } = useCountry();
    const { showSnackbar } = useSnackbar();
    const sidebarDefault: ImportCountry | '' = sidebarCountry === 'USA' || sidebarCountry === 'Canada' ? sidebarCountry : '';
    const [picked, setPicked] = useState<ImportCountry | '' | null>(null);
    const country = picked ?? sidebarDefault;
    const setCountry = setPicked;
    const [fields, setFields] = useState<Fields>(BLANK);
    const [stateOptions, setStateOptions] = useState<string[]>([]);
    const [typeOptions, setTypeOptions] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState('');

    // Region lists come from the same faceted endpoint the list filters use.
    useEffect(() => {
        if (!open || !country) return;
        let cancelled = false;
        axios.get('/api/towers?distinct=filters', { params: { country } })
            .then((response) => {
                if (cancelled) return;
                setStateOptions(response.data.states ?? []);
                setTypeOptions(response.data.types ?? []);
            })
            .catch((err) => { if (!cancelled) console.error('Could not load insert options:', err); });
        return () => { cancelled = true; };
    }, [open, country]);

    const reset = () => {
        setPicked(null);
        setFields(BLANK);
        setBusy(false);
        setConfirmed(false);
        setError('');
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const set = (key: keyof Fields) => (event: React.ChangeEvent<HTMLInputElement>) => {
        setFields((current) => ({ ...current, [key]: event.target.value }));
    };

    // The message must use the labels this region shows, not the USA names.
    const requiredFields: { key: keyof Fields; label: string }[] = [
        { key: 'Address', label: 'Address' },
        { key: 'City', label: 'City' },
        { key: 'County', label: 'County' },
        { key: 'State', label: country === 'Canada' ? 'Province' : 'State' },
        { key: 'ZIP', label: country === 'Canada' ? 'Postal Code' : 'ZIP' },
    ];
    const required = country ? requiredFields.filter((field) => !fields[field.key].trim()) : [];

    const handleInsert = async () => {
        setBusy(true);
        setError('');
        try {
            const response = await axios.post('/api/towers/insert', { country, fields });
            onInserted();
            handleClose();
            showSnackbar(
                response.data?.updated
                    ? 'Tower updated: this address was already in the list.'
                    : `Tower added to the ${country} list.`,
                'success',
            );
        } catch (err: unknown) {
            const message = axios.isAxiosError(err)
                ? (err.response?.data?.error ?? 'Insert failed')
                : 'Insert failed';
            setError(message);
            showSnackbar(message, 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    mx: { xs: 1, sm: 3 },
                    my: { xs: 2, sm: 4 },
                    // Required marks are red everywhere in this dialog.
                    '& .MuiFormLabel-asterisk': { color: 'error.main', fontWeight: 700 },
                },
            }}
        >
            <DialogTitle sx={{ pb: 1 }}>Add a Tower</DialogTitle>
            <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: { xs: 2, sm: 3 } }}>
                <Stack spacing={{ xs: 2, sm: 2.5 }}>
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Region *</Typography>
                        <Tabs
                            value={country || false}
                            onChange={(_event, value: ImportCountry) => {
                                setCountry(value);
                                setFields((current) => ({ ...current, State: '' }));
                                setConfirmed(false);
                                setError('');
                            }}
                            aria-label="Tower region"
                            sx={{ minHeight: 40, borderBottom: 1, borderColor: 'divider' }}
                        >
                            {COUNTRY_TABS.map((tab) => (
                                <Tab key={tab.country} value={tab.country} label={tab.label} sx={{ textTransform: 'none', minHeight: 40 }} />
                            ))}
                        </Tabs>
                        <Typography variant="caption" color="text.secondary">
                            {COUNTRY_TABS.find((tab) => tab.country === country)?.hint
                                ?? 'Pick a region. It decides the allowed state and postal format.'}
                        </Typography>
                    </Box>

                    <TextField label="Address" value={fields.Address} onChange={set('Address')} required fullWidth disabled={!country} />

                    <Box sx={{ display: 'grid', gap: { xs: 2, sm: 2.5 }, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                        <TextField label="City" value={fields.City} onChange={set('City')} required fullWidth disabled={!country} />
                        <TextField label="County" value={fields.County} onChange={set('County')} required fullWidth disabled={!country} />
                        <Autocomplete
                            options={stateOptions}
                            value={fields.State || null}
                            onChange={(_event, value) => setFields((current) => ({ ...current, State: value ?? '' }))}
                            // Typed text counts without pressing Enter: the field is
                            // freeSolo, so a value the list does not hold is allowed.
                            onInputChange={(_event, value) => setFields((current) => ({ ...current, State: value }))}
                            freeSolo
                            disabled={!country}
                            renderInput={(params) => (
                                <TextField {...params} label={country === 'USA' ? 'State' : 'Province'} required />
                            )}
                        />
                        <TextField
                            label={country === 'USA' ? 'ZIP' : 'Postal Code'}
                            value={fields.ZIP}
                            onChange={set('ZIP')}
                            required
                            fullWidth
                            disabled={!country}
                            helperText={country === 'USA' ? 'Any ZIP value' : 'Any postal code value'}
                        />
                    </Box>

                    <Typography variant="subtitle2" sx={{ pt: 0.5 }}>Optional</Typography>
                    <Box sx={{ display: 'grid', gap: { xs: 2, sm: 2.5 }, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                        <Autocomplete
                            options={typeOptions}
                            value={fields.Type || null}
                            onChange={(_event, value) => setFields((current) => ({ ...current, Type: value ?? '' }))}
                            onInputChange={(_event, value) => setFields((current) => ({ ...current, Type: value }))}
                            freeSolo
                            disabled={!country}
                            renderInput={(params) => <TextField {...params} label="Type" />}
                        />
                        <TextField
                            label="Lease Expiry"
                            type="date"
                            value={fields['Lease Expiry']}
                            onChange={set('Lease Expiry')}
                            disabled={!country}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            helperText="Leave blank when there is none"
                        />
                        <TextField label="Owner Name" value={fields['Owner Name']} onChange={set('Owner Name')} fullWidth disabled={!country} />
                        <TextField label="Contact Person" value={fields['Contact Person']} onChange={set('Contact Person')} fullWidth disabled={!country} />
                    </Box>
                    <TextField label="Notes" value={fields.Notes} onChange={set('Notes')} fullWidth multiline rows={2} disabled={!country} />

                    {error && <Alert severity="error">{error}</Alert>}
                    {country && required.length > 0 && (
                        <Alert severity="info">Still needed: {required.map((field) => field.label).join(', ')}.</Alert>
                    )}

                    <FormControlLabel
                        control={<Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />}
                        label="I checked the region and the values above."
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} disabled={busy} sx={{ textTransform: 'none' }}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={() => void handleInsert()}
                    disabled={busy || !country || required.length > 0 || !confirmed}
                    startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
                    sx={{ textTransform: 'none' }}
                >
                    {busy ? 'Adding...' : 'Add Tower'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
