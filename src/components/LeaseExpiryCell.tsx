'use client';

import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { formatLeaseExpiry, isLeaseExpiryUrgent, LEASE_URGENT_DAYS } from '@/lib/lease-expiry';

// Shared grid/detail cell for Lease Expiry: plain date normally, red outlined
// chip when the lease is expired or expiring within LEASE_URGENT_DAYS.
export default function LeaseExpiryCell({ value }: { value: string | null | undefined }) {
    if (!value) {
        return <Typography variant="body2" color="text.secondary">–</Typography>;
    }
    if (isLeaseExpiryUrgent(value)) {
        return (
            <Tooltip title={`Expired or expiring within ${LEASE_URGENT_DAYS} days`} placement="top">
                <Chip label={formatLeaseExpiry(value)} size="small" color="error" variant="outlined" />
            </Tooltip>
        );
    }
    return <Typography variant="body2">{formatLeaseExpiry(value)}</Typography>;
}
