'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import LayersIcon from '@mui/icons-material/Layers';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PublicIcon from '@mui/icons-material/Public';
import ApartmentIcon from '@mui/icons-material/Apartment';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import MapIcon from '@mui/icons-material/Map';
import {
    MAP_STYLES,
    type MapModeState,
    type MapStyleId,
} from '@/components/ui/cluster-styles';
import { mapOverlaySx } from '@/lib/map-overlay';

interface MapDetailsPanelProps {
    mapStyle: MapStyleId;
    onMapStyleChange: (style: MapStyleId) => void;
    mapModes: MapModeState;
    onMapModesChange: (modes: MapModeState) => void;
}

const STYLE_ORDER: MapStyleId[] = ['voyager', 'dark', 'satellite'];

/**
 * One icon per basemap. A glyph reads faster than a color chip at this size,
 * and needs no image asset or per-style color plumbing.
 */
const STYLE_ICONS: Record<MapStyleId, React.ReactNode> = {
    voyager: <MapIcon fontSize="small" />,
    dark: <DarkModeIcon fontSize="small" />,
    satellite: <SatelliteAltIcon fontSize="small" />,
};

/** Shared heading style for the two groups inside the panel. */
const sectionLabelSx = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'text.secondary',
    mb: 1,
} as const;

function ModeButton({
    label,
    icon,
    selected,
    onClick,
}: {
    label: string;
    icon: React.ReactNode;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <Box
            component="button"
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
                p: 1,
                width: '100%',
                border: '1px solid',
                borderColor: selected ? 'primary.main' : 'divider',
                borderRadius: 1.5,
                bgcolor: selected ? 'primary.soft' : 'background.paper',
                color: selected ? 'primary.main' : 'text.secondary',
                cursor: 'pointer',
                font: 'inherit',
                transition: 'all 150ms ease',
                '&:hover': { borderColor: selected ? 'primary.main' : 'text.disabled' },
            }}
        >
            {icon}
            <Typography sx={{ fontSize: 11, fontWeight: selected ? 700 : 500, lineHeight: 1.2 }}>
                {label}
            </Typography>
        </Box>
    );
}

export default function MapDetailsPanel({
    mapStyle,
    onMapStyleChange,
    mapModes,
    onMapModesChange,
}: MapDetailsPanelProps) {
    const [open, setOpen] = useState(false);

    return (
        <Paper
            elevation={0}
            sx={{
                ...mapOverlaySx,
                position: 'absolute',
                bottom: 40,
                left: 20,
                zIndex: 1000,
                width: 216,
                overflow: 'hidden',
            }}
        >
            <Box
                onClick={() => setOpen((v) => !v)}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpen((v) => !v);
                    }
                }}
                sx={{
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                }}
            >
                <LayersIcon fontSize="small" color="action" />
                <Box sx={{ flexGrow: 1 }}>
                    <Typography sx={{ fontWeight: 'bold', fontSize: '0.9rem', lineHeight: 1.2 }}>
                        Map details
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        {MAP_STYLES[mapStyle].label}
                        {mapModes.globe ? ' · Globe' : ''}
                        {mapModes.buildings3d ? ' · 3D' : ''}
                    </Typography>
                </Box>
                <ExpandMoreIcon
                    fontSize="small"
                    sx={{
                        color: 'text.secondary',
                        transform: open ? 'rotate(180deg)' : 'none',
                        transition: 'transform 150ms ease',
                    }}
                />
            </Box>

            <Collapse in={open}>
                <Divider />
                <Box sx={{ p: 1.5 }}>
                    <Typography sx={sectionLabelSx}>
                        Map type
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1 }}>
                        {STYLE_ORDER.map((id) => (
                            <ModeButton
                                key={id}
                                label={MAP_STYLES[id].label}
                                icon={STYLE_ICONS[id]}
                                selected={mapStyle === id}
                                onClick={() => onMapStyleChange(id)}
                            />
                        ))}
                    </Box>

                    <Divider sx={{ my: 1.5 }} />

                    <Typography sx={sectionLabelSx}>
                        Map details
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                        <ModeButton
                            label="3D Globe"
                            icon={<PublicIcon fontSize="small" />}
                            selected={mapModes.globe}
                            onClick={() => onMapModesChange({ ...mapModes, globe: !mapModes.globe })}
                        />
                        <ModeButton
                            label="3D Mode"
                            icon={<ApartmentIcon fontSize="small" />}
                            selected={mapModes.buildings3d}
                            onClick={() =>
                                onMapModesChange({ ...mapModes, buildings3d: !mapModes.buildings3d })
                            }
                        />
                    </Box>
                </Box>
            </Collapse>
        </Paper>
    );
}
