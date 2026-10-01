'use client';

import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import { CURRENCIES, type CurrencyCode } from '@/lib/appearance';
import { useAppearance } from './AppearanceProvider';

/** Display currency setting; the theme has no picker (light-only). */
export default function AppearanceSection() {
  const { currency, setCurrency } = useAppearance();

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Appearance
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Applies to this browser only.
      </Typography>

      <Stack spacing={2} sx={{ maxWidth: 420 }}>
        <FormControl>
          <InputLabel id="currency-label">Currency</InputLabel>
          <Select
            labelId="currency-label"
            id="currency"
            label="Currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
          >
            {CURRENCIES.map((option) => (
              <MenuItem key={option.code} value={option.code}>
                {option.code} &mdash; {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Typography variant="caption" color="text.secondary">
          Currency sets the symbol shown on money fields in the lead review form. It does
          not convert stored amounts.
        </Typography>
      </Stack>
    </Paper>
  );
}