import type { SxProps, Theme } from '@mui/material/styles';

/**
 * Frosted white surface shared by the floating map overlays: the viewport
 * readout, Map details, Show Leads, and the MapControls buttons.
 */
export const mapOverlaySx = {
    bgcolor: 'rgba(255, 255, 255, 0.85)',
    backdropFilter: 'blur(4px)',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 1,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
} satisfies SxProps<Theme>;
