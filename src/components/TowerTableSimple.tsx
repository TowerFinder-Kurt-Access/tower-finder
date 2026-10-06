'use client';

import * as React from 'react';
import { Box, Button, Menu, MenuItem, ListItemIcon, ListItemText, Chip, Badge, TextField, Stack, Typography, Autocomplete, Checkbox, Tooltip, IconButton, CircularProgress } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { DataGrid, GridColDef, GridToolbar, GridRenderCellParams, GridCellEditStopReasons, GridFooterContainer, GridPagination, GridColumnVisibilityModel, GridRowSelectionModel } from '@mui/x-data-grid';
import MapIcon from '@mui/icons-material/Map';
import BusinessIcon from '@mui/icons-material/Business';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StreetviewIcon from '@mui/icons-material/Streetview';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import InfoIcon from '@mui/icons-material/Info';
import NotesIcon from '@mui/icons-material/Notes';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import TowerIcon from '@mui/icons-material/SettingsInputAntenna';
import BlockIcon from '@mui/icons-material/Block';
import UndoIcon from '@mui/icons-material/Undo';

// The score is a ranking heuristic, not a tower detector. It never looks at map
// imagery, so the copy has to say so before anyone treats it as a verdict. Numbers
// come from the held-out evaluation in src/lib/ml/model.json (model rf-v2-2026-10-06).
const AI_SCORE_TOOLTIP = [
    'Heuristic rank, not a tower detection.',
    'Model rf-v2-2026-10-06 reads nearby business counts, tower spacing, and region.',
    'It never looks at map or satellite imagery.',
    'At the flagged cutoff it finds 3 in 4 flagged rows and misses 3 of 4 real towers.',
    'Use it to order your review queue only.',
].join(' ');

/** Mirrors the model threshold in src/lib/ml/model.json. Keep the two in step. */
const AI_SCORE_FLAG_PCT = 58;

// Defined at module level so MUI DataGrid receives a stable slot reference —
// a new function on every render causes DataGrid to unmount/remount the footer
// which can trigger spurious onPaginationModelChange resets.
interface CustomFooterSlotProps {
    currentPage: number;
    jumpPage: string;
    onJumpPageChange: (val: string) => void;
    onJumpSubmit: (e: React.FormEvent) => void;
}

const CustomFooter = React.memo(function CustomFooter(props: any) {
    const { currentPage, jumpPage, onJumpPageChange, onJumpSubmit } = props as CustomFooterSlotProps;
    return (
        <GridFooterContainer>
            <Box sx={{ flex: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mr: 2 }}>
                <form onSubmit={onJumpSubmit} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>Jump to:</Typography>
                    <TextField
                        size="small"
                        variant="standard"
                        value={jumpPage}
                        onChange={(e) => onJumpPageChange(e.target.value)}
                        placeholder={(currentPage + 1).toString()}
                        sx={{ width: 70, '& .MuiInputBase-input': { textAlign: 'center' } }}
                        type="number"
                        inputProps={{ min: 1 }}
                    />
                    <Button type="submit" size="small" sx={{ minWidth: 'auto', p: 0.5 }}>Go</Button>
                </form>
            </Box>
            <GridPagination />
        </GridFooterContainer>
    );
});

interface LookupItem {
    id: number;
    name: string;
}

interface TowerTableSimpleProps {
    towers: any[];
    totalCount: number;
    page: number;
    rowsPerPage: number;
    onPageChange: (page: number) => void;
    onRowsPerPageChange: (rowsPerPage: number) => void;
    onViewOnMap: (tower: any) => void;
    onGetOwner: (tower: any) => void;
    onViewDetails: (tower: any) => void;
    isOwnerLoading: boolean;
    isLoading: boolean;
    filterOptions: {
        cities: string[];
        states: string[];
        counties: string[];
        zips: string[];
        types: string[];
        carriers: string[];
        statuses: string[];
    };
    lookups?: {
        types: LookupItem[];
        carriers: LookupItem[];
        statuses: LookupItem[];
    };
    onFilterChange: (filters: {
        city?: string; state?: string; county?: string; zip?: string;
        type?: string; carrier?: string; status?: string; address?: string;
        search?: string;
        minBusinessCount?: string; maxBusinessCount?: string;
        minAvgDistance?: string; maxAvgDistance?: string;
        minAiScore?: string; maxAiScore?: string;
        hasOwnerName?: string;
    }) => void;
    filters?: {
        city?: string; state?: string; county?: string; zip?: string;
        type?: string; carrier?: string; status?: string; address?: string;
        search?: string;
        minBusinessCount?: string; maxBusinessCount?: string;
        minAvgDistance?: string; maxAvgDistance?: string;
        minAiScore?: string; maxAiScore?: string;
        hasOwnerName?: string;
    };
    onCellEdit?: (towerId: number, field: string, value: string) => void;
    sortModel?: { field: string; order: 'asc' | 'desc' } | null;
    onSortChange?: (model: { field: string; order: 'asc' | 'desc' } | null) => void;
    onNotesClick?: (tower: any) => void;
    onAddOwner?: (tower: any) => void;
    onVerdict?: (tower: any, verdict: 'tower' | 'not_tower' | null) => void;
    onSelectionChange?: (ids: number[]) => void;
    onExport?: (ids?: number[], all?: boolean) => void;
    isExporting?: boolean;
    country?: string;
}

export default function TowerTableSimple({
    towers,
    totalCount,
    page,
    rowsPerPage,
    onPageChange,
    onRowsPerPageChange,
    onViewOnMap,
    onViewDetails,
    isLoading,
    isExporting,
    filterOptions,
    lookups,
    onFilterChange,
    filters = {},
    onCellEdit,
    sortModel,
    onSortChange,
    onNotesClick,
    onAddOwner,
    onVerdict,
    onSelectionChange,
    onExport,
    country
}: TowerTableSimpleProps) {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const [selectedTower, setSelectedTower] = React.useState<any>(null);
    const [jumpPage, setJumpPage] = React.useState<string>('');
    const [localSearch, setLocalSearch] = React.useState(filters.search || '');
    const [selectionModel, setSelectionModel] = React.useState<GridRowSelectionModel>({ type: 'include', ids: new Set() });

    const handleSelectionChange = (newSelection: GridRowSelectionModel) => {
        setSelectionModel(newSelection);
        if (onSelectionChange) {
            const idsArray = newSelection.ids instanceof Set 
                ? Array.from(newSelection.ids) 
                : (newSelection.ids || []);
            onSelectionChange(idsArray as number[]);
        }
    };

    const getSelectionCount = () => {
        if (!selectionModel.ids) return 0;
        return selectionModel.ids instanceof Set 
            ? selectionModel.ids.size 
            : (selectionModel.ids as any[]).length;
    };

    const getSelectionIds = () => {
        if (!selectionModel.ids) return [];
        return selectionModel.ids instanceof Set 
            ? (Array.from(selectionModel.ids) as number[])
            : (selectionModel.ids as number[]);
    };

    const selectionCount = getSelectionCount();
    const selectionIds = getSelectionIds();

    React.useEffect(() => {
        setLocalSearch(filters.search || '');
    }, [filters.search]);

    const handleSearchSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        onFilterChange({ ...filters, search: localSearch.trim() || undefined });
    };

    // Default column visibility (lat/lon hidden by default)
    const defaultVisibility: GridColumnVisibilityModel = {
        lat: false,
        lon: false,
        businessCount: true,
        avgBusinessDistance: true,
    };

    // Column visibility with localStorage persistence
    const [columnVisibilityModel, setColumnVisibilityModel] = React.useState<GridColumnVisibilityModel>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('towersColumnVisibility');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) {
                    // ignore
                }
            }
        }
        return defaultVisibility;
    });

    const handleColumnVisibilityChange = (model: GridColumnVisibilityModel) => {
        setColumnVisibilityModel(model);
        localStorage.setItem('towersColumnVisibility', JSON.stringify(model));
    };

    const handleJumpToPage = (e: React.FormEvent) => {
        e.preventDefault();
        const pageNum = parseInt(jumpPage, 10);
        // "Jump to" intentionally does not clamp: users may move ahead of the pages
        // fetched so far, and the API resolves the real total.
        if (!isNaN(pageNum) && pageNum >= 1) {
            onPageChange(pageNum - 1); // 1-based input to 0-based API page
        }
    };


    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, tower: any) => {
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
        setSelectedTower(tower);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
        setSelectedTower(null);
    };

    const handleViewOnMap = () => {
        if (selectedTower) {
            onViewOnMap(selectedTower);
            handleMenuClose();
        }
    };

    const handleOpenGoogleMaps = () => {
        if (selectedTower) {
            const googleMapsUrl = `https://www.google.com/maps?q=${selectedTower.lat},${selectedTower.lon}`;
            window.open(googleMapsUrl, '_blank', 'noopener,noreferrer');
            handleMenuClose();
        }
    };

    const handleOpenSatelliteView = () => {
        if (selectedTower) {
            // Open Google Maps in satellite view at high zoom centered on exact coordinates
            const satelliteUrl = `https://www.google.com/maps/@${selectedTower.lat},${selectedTower.lon},20z/data=!3m1!1e3`;
            window.open(satelliteUrl, '_blank', 'noopener,noreferrer');
            handleMenuClose();
        }
    };

    const handleOpenBingMaps = () => {
        if (selectedTower) {
            // Open Bing Maps at the tower location with nearby places search
            const bingMapsUrl = `https://www.bing.com/maps?cp=${selectedTower.lat}~${selectedTower.lon}&lvl=17&style=r`;
            window.open(bingMapsUrl, '_blank', 'noopener,noreferrer');
            handleMenuClose();
        }
    };

    const handleViewDetails = () => {
        if (selectedTower) {
            onViewDetails(selectedTower);
            handleMenuClose();
        }
    };

    // Helper: count how many filter keys have a truthy value
    const activeFilterCount = Object.values(filters).filter(v => v && v.length > 0).length;

    const handleExternalFilterChange = (field: string, values: string[]) => {
        const newFilters = { ...filters, [field]: values.join(',') };
        // Remove keys with empty value
        if (!values.length) delete (newFilters as any)[field];
        onFilterChange(newFilters);
    };

    const removeFilterValue = (field: string, valueToRemove: string) => {
        const current = ((filters as any)[field] || '').split(',').filter(Boolean);
        const updated = current.filter((v: string) => v !== valueToRemove);
        handleExternalFilterChange(field, updated);
    };

    // Collect all active filter chips for display
    const activeChips: { field: string; label: string; value: string }[] = [];
    const fieldLabels: Record<string, string> = {
        city: 'City', state: country === 'USA' ? 'State' : 'Province',
        county: 'County', zip: country === 'USA' ? 'ZIP' : 'Postal Code',
        type: 'Type', status: 'Status', carrier: 'Carrier',
        minBusinessCount: 'Min Businesses', maxAvgDistance: 'Max Distance',
        minAiScore: 'Min Likelihood %', maxAiScore: 'Max Likelihood %'
    };
    for (const [field, label] of Object.entries(fieldLabels)) {
        const val = (filters as any)[field];
        if (val) {
            val.split(',').filter(Boolean).forEach((v: string) => {
                activeChips.push({ field, label, value: v });
            });
        }
    }

    const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
    const checkedIcon = <CheckBoxIcon fontSize="small" />;

    const renderFilterAutocomplete = (field: string, label: string, options: string[]) => {
        const selected = ((filters as any)[field] || '').split(',').filter(Boolean);
        return (
            <Autocomplete
                multiple
                size="small"
                options={options}
                disableCloseOnSelect
                value={selected}
                onChange={(_, newValue) => handleExternalFilterChange(field, newValue)}
                renderOption={(props, option, { selected: sel }) => {
                    const { key, ...otherProps } = props as any;
                    return (
                        <li key={key} {...otherProps}>
                            <Checkbox icon={icon} checkedIcon={checkedIcon} style={{ marginRight: 8 }} checked={sel} size="small" />
                            {option}
                        </li>
                    );
                }}
                renderTags={() => null}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        label={label}
                        placeholder={selected.length ? `${selected.length} selected` : 'All'}
                        sx={{
                            minWidth: 200,
                            '& .MuiOutlinedInput-root': {
                                bgcolor: selected.length ? 'primary.50' : 'transparent',
                                borderColor: selected.length ? 'primary.main' : undefined,
                            },
                            '& .MuiInputLabel-root': {
                                color: selected.length ? 'primary.main' : undefined,
                                fontWeight: selected.length ? 600 : 400,
                            }
                        }}
                    />
                )}
                sx={{ minWidth: 200, flex: 1, flexBasis: 200, maxWidth: 300 }}
            />
        );
    };

    const externalFiltersBar = (
        <Box sx={{ borderBottom: '1px solid #e0e0e0', bgcolor: 'white' }}>
            {/* Search Bar Row */}
            <Box sx={{ p: 2, pb: 0, display: 'flex', gap: 1 }}>
                <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flex: 1, gap: 8 }}>
                    <TextField
                        fullWidth
                        variant="outlined"
                        size="small"
                        placeholder="Search across all fields..."
                        value={localSearch}
                        onChange={(e) => setLocalSearch(e.target.value)}
                        sx={{ bgcolor: 'white' }}
                    />
                    <Button type="submit" variant="contained" color="primary" sx={{ minWidth: '100px' }}>
                        Search
                    </Button>
                </form>
            </Box>

            {/* Filter Dropdowns Row */}
            <Box sx={{ p: 1, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <Tooltip title="Filters">
                    <Badge badgeContent={activeFilterCount} color="primary" sx={{ mr: 0.5 }}>
                        <FilterListIcon color={activeFilterCount > 0 ? 'primary' : 'action'} />
                    </Badge>
                </Tooltip>
                {renderFilterAutocomplete('state', country === 'USA' ? 'State' : 'Province', filterOptions.states)}
                {renderFilterAutocomplete('city', 'City', filterOptions.cities)}
                {filterOptions.counties.length > 0 && renderFilterAutocomplete('county', 'County', filterOptions.counties)}
                {renderFilterAutocomplete('zip', country === 'USA' ? 'ZIP' : 'Postal Code', filterOptions.zips)}
                {renderFilterAutocomplete('type', 'Type', filterOptions.types)}
                {renderFilterAutocomplete('status', 'Status', filterOptions.statuses)}
                {renderFilterAutocomplete('carrier', 'Carrier', filterOptions.carriers)}
                
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', ml: 1, borderLeft: '1px solid #e0e0e0', pl: 2 }}>
                    <TextField
                        label="Min Businesses"
                        size="small"
                        type="number"
                        value={filters.minBusinessCount || ''}
                        onChange={(e) => onFilterChange({ ...filters, minBusinessCount: e.target.value || undefined })}
                        sx={{ width: 130 }}
                    />
                    <TextField
                        label="Max Distance (m)"
                        size="small"
                        type="number"
                        value={filters.maxAvgDistance || ''}
                        onChange={(e) => onFilterChange({ ...filters, maxAvgDistance: e.target.value || undefined })}
                        sx={{ width: 130 }}
                    />
                    <TextField
                        label="Min Likelihood %"
                        size="small"
                        type="number"
                        inputProps={{ min: 0, max: 100 }}
                        value={filters.minAiScore || ''}
                        onChange={(e) => onFilterChange({ ...filters, minAiScore: e.target.value || undefined })}
                        sx={{ width: 130 }}
                    />
                    <TextField
                        label="Max Likelihood %"
                        size="small"
                        type="number"
                        inputProps={{ min: 0, max: 100 }}
                        value={filters.maxAiScore || ''}
                        onChange={(e) => onFilterChange({ ...filters, maxAiScore: e.target.value || undefined })}
                        sx={{ width: 130 }}
                    />
                    <TextField
                        select
                        label="Owner Name"
                        size="small"
                        value={filters.hasOwnerName || ''}
                        onChange={(e) => onFilterChange({ ...filters, hasOwnerName: e.target.value || undefined })}
                        sx={{ width: 130 }}
                        SelectProps={{ native: true }}
                        InputLabelProps={{ shrink: true }}
                    >
                        <option value="">Any</option>
                        <option value="true">Has owner</option>
                        <option value="false">No owner</option>
                    </TextField>
                </Box>

                <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                    {onExport && (
                        <>
                            <Button
                                size="small"
                                variant="outlined"
                                color="success"
                                startIcon={isExporting ? <CircularProgress size={16} color="inherit" /> : <FileDownloadIcon />}
                                onClick={() => onExport(selectionCount > 0 ? selectionIds : undefined, selectionCount === 0)}
                                disabled={isExporting}
                                sx={{ textTransform: 'none', fontWeight: 600 }}
                            >
                                {isExporting 
                                    ? 'Exporting...' 
                                    : (selectionCount > 0 ? `Export Selected (${selectionCount})` : 'Export Filtered')
                                }
                            </Button>
                            <Button
                                size="small"
                                variant="outlined"
                                color="success"
                                startIcon={isExporting ? <CircularProgress size={16} color="inherit" /> : <FileDownloadIcon />}
                                onClick={() => onExport(undefined, true)}
                                disabled={isExporting}
                                sx={{ textTransform: 'none', fontWeight: 600 }}
                            >
                                {isExporting ? 'Exporting...' : 'Export All'}
                            </Button>
                        </>
                    )}

                    {activeFilterCount > 0 && (
                        <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<ClearIcon />}
                            onClick={() => onFilterChange({})}
                            sx={{ textTransform: 'none', fontWeight: 600 }}
                        >
                            Clear All ({activeFilterCount})
                        </Button>
                    )}
                </Box>
            </Box>
            {/* Active Filter Chips Row */}
            {activeChips.length > 0 && (
                <Box sx={{ px: 1, pb: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {activeChips.map((chip, i) => (
                        <Chip
                            key={`${chip.field}-${chip.value}-${i}`}
                            label={`${chip.label}: ${chip.value}`}
                            size="small"
                            color="primary"
                            variant="outlined"
                            onDelete={() => removeFilterValue(chip.field, chip.value)}
                            sx={{ fontWeight: 500 }}
                        />
                    ))}
                </Box>
            )}
        </Box>
    );

    // In-cell editing must offer the full type/status lists, not the narrowed filter options.
    const editTypeOptions = (lookups?.types || []).map(t => t.name);
    const editStatusOptions = (lookups?.statuses || []).map(s => s.name);

    const columns: GridColDef[] = [
        { field: 'id', headerName: 'ID', width: 80, type: 'number' },
        {
            field: 'type', headerName: 'Type', width: 120,
            type: 'singleSelect',
            editable: !!onCellEdit,
            valueOptions: editTypeOptions,
            valueGetter: (value: any) => (value && typeof value === 'object') ? value.name : (value || '')
        },
        {
            field: 'status',
            headerName: 'Status',
            width: 180,
            type: 'singleSelect',
            editable: !!onCellEdit,
            valueOptions: editStatusOptions,
            valueGetter: (value: any, row: any) => {
                if (value && typeof value === 'object') return value.name || '';
                if (value === undefined || value === null) return row.legacyStatus || '';
                return value;
            },
            renderCell: (params: GridRenderCellParams) => (
                <Chip
                    label={params.value || 'Unknown'}
                    size="small"
                    color="primary"
                    variant="outlined"
                />
            )
        },
        {
            field: 'aiTowerScore',
            headerName: 'Tower Likelihood',
            width: 120,
            type: 'number',
            renderHeader: () => (
                <Tooltip
                    title={AI_SCORE_TOOLTIP}
                    placement="top"
                    componentsProps={{ tooltip: { sx: { maxWidth: 320 } } }}
                >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Tower Likelihood</Typography>
                </Tooltip>
            ),
            renderCell: (params: GridRenderCellParams) => {
                const score = params.row.aiTowerScore;
                if (score === null || score === undefined) {
                    return <Typography variant="body2" color="text.secondary">–</Typography>;
                }
                const pct = Math.round(score * 100);
                return (
                    <Tooltip title={AI_SCORE_TOOLTIP} placement="top" componentsProps={{ tooltip: { sx: { maxWidth: 320 } } }}>
                        <Chip
                            label={`${pct}%`}
                            size="small"
                            color={pct >= AI_SCORE_FLAG_PCT ? 'warning' : 'default'}
                        />
                    </Tooltip>
                );
            }
        },
        {
            field: 'humanLabel',
            headerName: 'Verdict',
            width: 110,
            sortable: false,
            renderCell: (params: GridRenderCellParams) => {
                const label = params.row.humanLabel;
                const source = params.row.labelSource;
                if (label !== 'tower' && label !== 'not_tower') {
                    return <Typography variant="body2" color="text.secondary">–</Typography>;
                }
                const chip = (
                    <Chip
                        label={label === 'tower' ? 'Tower' : 'Not tower'}
                        size="small"
                        color={label === 'tower' ? 'success' : 'default'}
                        variant={source === 'reviewer' ? 'filled' : 'outlined'}
                    />
                );
                return (
                    <Tooltip
                        title={source === 'reviewer'
                            ? 'Reviewer verdict — used as training data.'
                            : 'Guessed from review status or notes. Weak label.'}
                        placement="top"
                    >
                        {chip}
                    </Tooltip>
                );
            }
        },
        {
            field: 'hasOwnerName',
            headerName: 'Owner Name',
            width: 120,
            renderCell: (params: GridRenderCellParams) => {
                const has = params.row.hasOwnerName ?? !!(params.row.parcel && params.row.parcel.ownerId);
                const name = params.row.parcel?.owner?.name;
                return has ? (
                    <Tooltip title={name || ''}>
                        <Chip label="Yes" size="small" color="success" />
                    </Tooltip>
                ) : (
                    <Typography variant="body2" color="text.secondary">–</Typography>
                );
            }
        },
        {
            field: 'notesCount',
            headerName: 'Notes',
            width: 80,
            renderCell: (params: GridRenderCellParams) => {
                const count = params.row._count?.notes || 0;
                return (
                    <Box
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onNotesClick) onNotesClick(params.row);
                        }}
                        sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', height: '100%' }}
                    >
                        {count > 0 ? (
                            <Badge badgeContent={count} color="primary">
                                <NotesIcon color="action" />
                            </Badge>
                        ) : (
                            <NotesIcon color="disabled" />
                        )}
                    </Box>
                );
            }
        },
        { field: 'address', headerName: 'Address', width: 200, flex: 1, minWidth: 200 },
        {
            field: 'city',
            headerName: 'City',
            width: 120,
            type: 'singleSelect',
            valueOptions: filterOptions.cities
        },
        {
            field: 'county',
            headerName: 'County',
            width: 120,
            type: 'singleSelect',
            valueOptions: filterOptions.counties
        },
        {
            field: 'state',
            headerName: country === 'USA' ? 'State' : 'Province',
            width: 100,
            type: 'singleSelect',
            valueOptions: filterOptions.states
        },
        {
            field: 'zip',
            headerName: country === 'USA' ? 'ZIP' : 'Postal Code',
            width: 100,
            type: 'singleSelect',
            valueOptions: filterOptions.zips
        },
        {
            field: 'lat',
            headerName: 'Latitude',
            width: 100,
            valueGetter: (_value: any, row: any) => row.lat?.toFixed(6) || ''
        },
        {
            field: 'lon',
            headerName: 'Longitude',
            width: 100,
            valueGetter: (_value: any, row: any) => row.lon?.toFixed(6) || ''
        },
        {
            field: 'businessCount',
            headerName: 'Businesses',
            width: 120,
            type: 'number',
            valueGetter: (value: any) => value ?? 0,
            renderCell: (params: GridRenderCellParams) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <BusinessIcon fontSize="small" color="action" />
                    <Typography variant="body2">{params.value}</Typography>
                </Box>
            )
        },
        {
            field: 'avgBusinessDistance',
            headerName: 'Avg Distance (m)',
            width: 150,
            type: 'number',
            valueGetter: (value: any) => value ? Math.round(value) : null,
            renderCell: (params: GridRenderCellParams) => (
                params.value !== null ? (
                    <Typography variant="body2">{params.value} m</Typography>
                ) : (
                    <Typography variant="body2" color="text.secondary">-</Typography>
                )
            )
        },
        {
            field: 'actions',
            headerName: 'Actions',
            width: 120,
            sortable: false,
            filterable: false,
            renderCell: (params: GridRenderCellParams) => (
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<MoreVertIcon />}
                    onClick={(e) => handleMenuOpen(e, params.row)}
                >
                    Actions
                </Button>
            )
        },
    ];

    // Sorting runs server-side; only fields the API can order by are sortable
    const SERVER_SORTABLE = new Set(['id', 'businessCount', 'avgBusinessDistance', 'aiTowerScore', 'hasOwnerName']);
    const sortableColumns = columns.map(c => ({ ...c, sortable: SERVER_SORTABLE.has(c.field) }));

    // Stable references for controlled DataGrid props — creating new objects/arrays on
    // every render causes MUI DataGrid v8 to fire onSortModelChange / onPaginationModelChange
    // spuriously, which calls setPage(0) and resets the user back to the first page.
    const sortModelArray = React.useMemo(
        () => sortModel ? [{ field: sortModel.field, sort: sortModel.order }] : [],
        [sortModel]
    );
    const paginationModelObj = React.useMemo(
        () => ({ page, pageSize: rowsPerPage }),
        [page, rowsPerPage]
    );

    return (
        <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
            {externalFiltersBar}
            <DataGrid
                rows={towers}
                columns={sortableColumns}
                rowCount={totalCount}
                paginationMode="server"
                filterMode="server"
                sortingMode="server"
                sortModel={sortModelArray}
                onSortModelChange={(model) => {
                    if (!onSortChange) return;
                    const newSort = (model.length === 0 || !model[0].sort)
                        ? null
                        : { field: model[0].field, order: model[0].sort as 'asc' | 'desc' };
                    // Guard: skip if sort hasn't actually changed (prevents spurious setPage(0))
                    if (newSort?.field === sortModel?.field && newSort?.order === sortModel?.order) return;
                    onSortChange(newSort);
                }}
                paginationModel={paginationModelObj}
                onPaginationModelChange={(model) => {
                    if (model.page !== page) {
                        onPageChange(model.page);
                    }
                    if (model.pageSize !== rowsPerPage) {
                        onRowsPerPageChange(model.pageSize);
                        onPageChange(0);
                    }
                }}
                checkboxSelection
                rowSelectionModel={selectionModel}
                onRowSelectionModelChange={handleSelectionChange}
                processRowUpdate={(newRow, oldRow) => {
                    // Find which field changed
                    const editableFields = ['type', 'carrier', 'status'];
                    for (const field of editableFields) {
                        if (newRow[field] !== oldRow[field] && onCellEdit) {
                            onCellEdit(newRow.id, field, newRow[field]);
                        }
                    }
                    return newRow;
                }}
                onProcessRowUpdateError={(error) => {
                    console.error('Error updating row:', error);
                }}
                pageSizeOptions={[25, 50, 100, 500]}
                slots={{
                    toolbar: GridToolbar,
                    footer: CustomFooter
                }}
                slotProps={{
                    toolbar: { showQuickFilter: false },
                    footer: {
                        currentPage: page,
                        jumpPage,
                        onJumpPageChange: setJumpPage,
                        onJumpSubmit: handleJumpToPage,
                    } as any
                }}
                disableRowSelectionOnClick
                disableColumnFilter
                loading={isLoading}
                columnVisibilityModel={columnVisibilityModel}
                onColumnVisibilityModelChange={handleColumnVisibilityChange}
            />
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                onClick={(e) => e.stopPropagation()}
            >
                <MenuItem onClick={handleViewDetails}>
                    <ListItemIcon>
                        <InfoIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>View Details</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleViewOnMap}>
                    <ListItemIcon>
                        <MapIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>View on Map</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleOpenGoogleMaps}>
                    <ListItemIcon>
                        <OpenInNewIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Open in Google Maps</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleOpenSatelliteView}>
                    <ListItemIcon>
                        <StreetviewIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Open Satellite View</ListItemText>
                </MenuItem>
                {/* Lookup Property Owner was removed as dead code: the button never had a
                    consumer. handleLookupOwner in src/app/towers/page.tsx still works and is
                    reachable from the tower detail page. */}
                <MenuItem onClick={handleOpenBingMaps}>
                    <ListItemIcon>
                        <TravelExploreIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Search Nearby (Bing)</ListItemText>
                </MenuItem>
                {onAddOwner && (
                    <MenuItem onClick={() => {
                        if (selectedTower) {
                            onAddOwner(selectedTower);
                            handleMenuClose();
                        }
                    }}>
                        <ListItemIcon>
                            <PersonAddIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Add Property Owner</ListItemText>
                    </MenuItem>
                )}
                {onVerdict && selectedTower && <MenuItem disabled>
                    <ListItemText sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        {selectedTower.humanLabel === 'tower' ? 'Verdict: tower' :
                            selectedTower.humanLabel === 'not_tower' ? 'Verdict: not a tower' : 'Verdict: not set'}
                    </ListItemText>
                </MenuItem>}
                {onVerdict && (
                    <>
                        <MenuItem onClick={() => {
                            if (selectedTower) onVerdict(selectedTower, 'tower');
                            handleMenuClose();
                        }}>
                            <ListItemIcon><TowerIcon fontSize="small" color="success" /></ListItemIcon>
                            <ListItemText>Confirm: is a tower</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={() => {
                            if (selectedTower) onVerdict(selectedTower, 'not_tower');
                            handleMenuClose();
                        }}>
                            <ListItemIcon><BlockIcon fontSize="small" /></ListItemIcon>
                            <ListItemText>Confirm: not a tower</ListItemText>
                        </MenuItem>
                        {selectedTower?.humanLabel && (
                            <MenuItem onClick={() => {
                                if (selectedTower) onVerdict(selectedTower, null);
                                handleMenuClose();
                            }}>
                                <ListItemIcon><UndoIcon fontSize="small" /></ListItemIcon>
                                <ListItemText>Clear verdict</ListItemText>
                            </MenuItem>
                        )}
                    </>
                )}
            </Menu>
        </Box>
    );
}
