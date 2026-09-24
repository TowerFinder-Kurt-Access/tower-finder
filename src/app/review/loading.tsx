'use client';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';

// Shown while the /review page chunk or its first DB fetch is in flight.
export default function Loading() {
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, width: '100%', maxWidth: 1200, mx: 'auto', minWidth: 0 }}>
      <Paper
        elevation={0}
        sx={{
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
            <Skeleton width={300} height={40} />
            <Skeleton width={230} height={20} sx={{ mt: 0.5 }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Skeleton variant="rounded" width={280} height={40} />
            <Skeleton variant="rounded" width={132} height={40} />
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gap: 1.5, mt: 2.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' } }}>
          {['Total', 'Draft', 'Finalized', 'Closed'].map((label) => (
            <Box key={label} sx={{ px: 2, py: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <Skeleton width={34} height={32} />
              <Skeleton width={62} height={14} />
            </Box>
          ))}
        </Box>
      </Paper>
      <Paper
        elevation={0}
        sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}
      >
        <Box sx={{ display: 'flex', gap: 1, px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          {['All', 'Draft', 'Finalized', 'Closed'].map((label) => (
            <Skeleton key={label} variant="rounded" width={92} height={24} />
          ))}
        </Box>
        {Array.from({ length: 5 }).map((_, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 2, px: 2, py: 2, borderBottom: i < 4 ? '1px solid' : 'none', borderColor: 'divider' }}>
            <Skeleton width={40} height={20} />
            <Skeleton width="28%" height={20} />
            <Skeleton width="14%" height={20} />
            <Skeleton width="24%" height={20} />
            <Skeleton width={72} height={24} />
          </Box>
        ))}
      </Paper>
    </Box>
  );
}
