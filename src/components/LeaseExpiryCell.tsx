'use client';

import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { formatLeaseExpiry, leaseExpiryStage, type LeaseExpiryStage } from '@/lib/lease-expiry';

// Notice reason per stage, so the chip and its tooltip say how close the lease is.
const STAGE_LABEL = {
    expired: 'Lease expired',
    threeMonths: 'Expires within 3 months',
    sixMonths: 'Expires within 6 months',
    oneYear: 'Expires within 1 year',
} satisfies Record<LeaseExpiryStage, string>;

// Shared grid/detail cell for Lease Expiry: plain date normally, outlined chip
// once the lease is expired or inside a notice window.
export default function LeaseExpiryCell({ value }: { value: string | null | undefined }) {
    if (!value) {
        return <Typography variant="body2" color="text.secondary">–</Typography>;
    }
    const stage = leaseExpiryStage(value);
    if (stage) {
        return (
            <Tooltip title={STAGE_LABEL[stage]} placement="top">
                <Chip
                    label={formatLeaseExpiry(value)}
                    size="small"
                    color={stage === 'expired' || stage === 'threeMonths' ? 'error' : 'warning'}
                    variant="outlined"
                />
            </Tooltip>
        );
    }
    return <Typography variant="body2">{formatLeaseExpiry(value)}</Typography>;
}
