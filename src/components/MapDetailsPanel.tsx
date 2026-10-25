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
import {
    MAP_STYLES,
    type MapModeState,
    type MapStyleId,
} from '@/components/ui/cluster-styles';

interface MapDetailsPanelProps {
    mapStyle: MapStyleId;
    onMapStyleChange: (style: MapStyleId) => void;
    mapModes: MapModeState;
    onMapModesChange: (modes: MapModeState) => void;
}

const STYLE_ORDER: MapStyleId[] = ['light', 'dark', 'voyager', 'satellite'];

/** A basemap thumbnail. Colors only, so no image asset is needed. */
function StyleSwatch({ style, selected }: { style: MapStyleId; selected: boolean }) {
    const { swatch } = MAP_STYLES[style];
    return (
        <Box
            sx={{
                position: 'relative',
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: 1.5,
                overflow: 'hidden',
                bgcolor: swatch.land,
                border: '2px solid',
                borderColor: selected ? 'primary.main' : 'divider',
                transition: 'border-color 150ms ease',
            }}
        >
            {/* Water band, so the swatch reads as a map rather than a color chip. */}
            <Box
                sx={{
                    position: 'absolute',
                    inset: 0,
                    background: `linear-gradient(160deg, transparent 55%, ${swatch.water} 55%)`,
                }}
            />
            {/* Two road strokes. */}
            <Box
                sx={{
                    position: 'absolute',
                    top: '48%',
                    left: '-10%',
                    width: '120%',
                    height: 3,
                    bgcolor: swatch.background,
                    transform: 'rotate(-12deg)',
                }}
            />
            <Box
                sx={{
                    position: 'absolute',
                    top: '-10%',
                    left: '42%',
                    width: 2,
                    height: '120%',
                    bgcolor: swatch.background,
                    transform: 'rotate(8deg)',
                }}
            />
            {selected && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: 'primary.main',
                        border: '2px solid',
                        borderColor: 'background.paper',
                    }}
                />
            )}
        </Box>
    );
}

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
            elevation={3}
            sx={{
                position: 'absolute',
                top: 90,
                right: 20,
                zIndex: 1000,
                width: 216,
                borderRadius: 2,
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
                    <Typography
                        sx={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: 'text.secondary',
                            mb: 1,
                        }}
                    >
                        Map type
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                        {STYLE_ORDER.map((id) => (
                            <Box
                                component="button"
                                type="button"
                                key={id}
                                onClick={() => onMapStyleChange(id)}
                                aria-pressed={mapStyle === id}
                                sx={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 0.5,
                                    p: 0,
                                    border: 0,
                                    bgcolor: 'transparent',
                                    cursor: 'pointer',
                                    font: 'inherit',
                                }}
                            >
                                <StyleSwatch style={id} selected={mapStyle === id} />
                                <Typography
                                    sx={{
                                        fontSize: 11,
                                        fontWeight: mapStyle === id ? 700 : 500,
                                        color: mapStyle === id ? 'primary.main' : 'text.secondary',
                                    }}
                                >
                                    {MAP_STYLES[id].label}
                                </Typography>
                            </Box>
                        ))}
                    </Box>

                    <Divider sx={{ my: 1.5 }} />

                    <Typography
                        sx={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: 'text.secondary',
                            mb: 1,
                        }}
                    >
                        Map details
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                        <ModeButton
                            label="3D Globe"
                            icon={<PublicIcon fontSize="small" />}
                            selected={mapModes.globe}
                            onClick={() =>
                                // Globe and 3D buildings are mutually exclusive:
                                // buildings only extrude on the flat projection.
                                onMapModesChange({
                                    globe: !mapModes.globe,
                                    buildings3d: false,
                                })
                            }
                        />
                        <ModeButton
                            label="3D Mode"
                            icon={<ApartmentIcon fontSize="small" />}
                            selected={mapModes.buildings3d}
                            onClick={() =>
                                onMapModesChange({
                                    globe: false,
                                    buildings3d: !mapModes.buildings3d,
                                })
                            }
                        />
                    </Box>
                </Box>
            </Collapse>
        </Paper>
    );
}
