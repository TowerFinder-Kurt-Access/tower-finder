'use client';

import * as React from 'react';
import { Box, Button, Menu, MenuItem, ListItemIcon, ListItemText, Chip, Badge, TextField, Stack, Typography, Autocomplete, Checkbox, Tooltip, IconButton, CircularProgress } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { DataGrid, GridColDef, GridToolbar, GridRenderCellParams, GridCellEditStopReasons, GridFooterContainer, GridPagination, GridSlotsComponentsProps, GridColumnVisibilityModel, GridRowSelectionModel } from '@mui/x-data-grid';
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
    };
    onFilterChange: (filters: {
        city?: string; state?: string; county?: string; zip?: string;
        type?: string; carrier?: string; status?: string; address?: string;
        search?: string;
        minBusinessCount?: string; maxBusinessCount?: string;
        minAvgDistance?: string; maxAvgDistance?: string;
        minAiScore?: string; maxAiScore?: string;
    }) => void;
    filters?: {
        city?: string; state?: string; county?: string; zip?: string;
        type?: string; carrier?: string; status?: string; address?: string;
        search?: string;
        minBusinessCount?: string; maxBusinessCount?: string;
        minAvgDistance?: string; maxAvgDistance?: string;
        minAiScore?: string; maxAiScore?: string;
    };
    onCellEdit?: (towerId: number, field: string, value: string) => void;
    sortModel?: { field: string; order: 'asc' | 'desc' } | null;
    onSortChange?: (model: { field: string; order: 'asc' | 'desc' } | null) => void;
    onNotesClick?: (tower: any) => void;
    onAddOwner?: (tower: any) => void;
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
    onGetOwner,
    onViewDetails,
    isOwnerLoading,
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
        // Ensure page is within valid range (1 to totalPages)
        const totalPages = Math.ceil(totalCount / rowsPerPage);

        if (!isNaN(pageNum) && pageNum >= 1) {
            // Convert 1-based user input to 0-based API page
            // If user enters a number larger than max, standard behavior is often to go to last page,
            // or we can let the API handle it / user beware. Let's clamp it if we know total.
            // But we might be in server-side pagination where we don't know total easily in all cases?
            // current totalCount is passed in.

            // Allow jumping beyond current known count if user wants to try, 
            // but usually we should clamp to totalPages if known. 
            // However, typical "Jump to" features allow going to any page.

            const targetPage = pageNum - 1;
            onPageChange(targetPage);
        }
    };

    // Custom Footer Component
    const CustomFooter = (props: NonNullable<GridSlotsComponentsProps['footer']>) => {
        return (
            <GridFooterContainer>
                <Box sx={{ flex: 1 }} /> {/* Spacer to push content to right */}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mr: 2 }}>
                    <form onSubmit={handleJumpToPage} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>Jump to:</Typography>
                        <TextField
                            size="small"
                            variant="standard"
                            value={jumpPage}
                            onChange={(e) => setJumpPage(e.target.value)}
                            placeholder={(page + 1).toString()}
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

    const handleGetOwner = () => {
        if (selectedTower) {
            onGetOwner(selectedTower);
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

    const handleFilterModelChange = (filterModel: any) => {
        const newFilters: { city?: string; state?: string; county?: string; zip?: string; type?: string; carrier?: string; status?: string; address?: string; search?: string } = { ...filters };

        if (filterModel.items && filterModel.items.length > 0) {
            filterModel.items.forEach((item: any) => {
                if (item.value) {
                    switch (item.field) {
                        case 'city': newFilters.city = item.value; break;
                        case 'county': newFilters.county = item.value; break;
                        case 'state': newFilters.state = item.value; break;
                        case 'zip': newFilters.zip = item.value; break;
                        case 'type': newFilters.type = item.value; break;
                        case 'carrier': newFilters.carrier = item.value; break;
                        case 'status': newFilters.status = item.value; break;
                        case 'address': newFilters.address = item.value; break;
                    }
                }
            });
        }

        onFilterChange(newFilters);
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
        minAiScore: 'Min AI %', maxAiScore: 'Max AI %'
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
                        label="Min AI Score %"
                        size="small"
                        type="number"
                        inputProps={{ min: 0, max: 100 }}
                        value={filters.minAiScore || ''}
                        onChange={(e) => onFilterChange({ ...filters, minAiScore: e.target.value || undefined })}
                        sx={{ width: 130 }}
                    />
                    <TextField
                        label="Max AI Score %"
                        size="small"
                        type="number"
                        inputProps={{ min: 0, max: 100 }}
                        value={filters.maxAiScore || ''}
                        onChange={(e) => onFilterChange({ ...filters, maxAiScore: e.target.value || undefined })}
                        sx={{ width: 130 }}
                    />
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

    const columns: GridColDef[] = [
        {
            field: 'type', headerName: 'Type', width: 120,
            type: 'singleSelect',
            editable: !!onCellEdit,
            valueOptions: filterOptions.types,
            valueGetter: (value: any) => (value && typeof value === 'object') ? value.name : (value || '')
        },
        {
            field: 'status',
            headerName: 'Status',
            width: 180,
            type: 'singleSelect',
            editable: !!onCellEdit,
            valueOptions: filterOptions.statuses,
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
            headerName: 'AI Score',
            width: 100,
            type: 'number',
            renderCell: (params: GridRenderCellParams) => {
                const score = params.row.aiTowerScore;
                if (score === null || score === undefined) {
                    return <Typography variant="body2" color="text.secondary">–</Typography>;
                }
                const pct = Math.round(score * 100);
                return (
                    <Chip
                        label={`${pct}%`}
                        size="small"
                        color={pct >= 70 ? 'success' : pct >= 40 ? 'warning' : 'default'}
                    />
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
            valueGetter: (value: any, row: any) => row.lat?.toFixed(6) || ''
        },
        {
            field: 'lon',
            headerName: 'Longitude',
            width: 100,
            valueGetter: (value: any, row: any) => row.lon?.toFixed(6) || ''
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
    const SERVER_SORTABLE = new Set(['businessCount', 'avgBusinessDistance', 'aiTowerScore']);
    const sortableColumns = columns.map(c => ({ ...c, sortable: SERVER_SORTABLE.has(c.field) }));

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
                sortModel={sortModel ? [{ field: sortModel.field, sort: sortModel.order }] : []}
                onSortModelChange={(model) => {
                    if (!onSortChange) return;
                    if (model.length === 0 || !model[0].sort) {
                        onSortChange(null);
                    } else {
                        onSortChange({ field: model[0].field, order: model[0].sort });
                    }
                }}
                paginationModel={{ page, pageSize: rowsPerPage }}
                onPaginationModelChange={(model) => {
                    if (model.page !== page) {
                        onPageChange(model.page);
                    }
                    if (model.pageSize !== rowsPerPage) {
                        onRowsPerPageChange(model.pageSize);
                        onPageChange(0);
                    }
                }}
                onFilterModelChange={handleFilterModelChange}
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
                    toolbar: {
                        showQuickFilter: false,
                    },
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
                {/* <MenuItem onClick={handleGetOwner} disabled={isOwnerLoading}>
                    <ListItemIcon>
                        <BusinessIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{isOwnerLoading ? 'Loading Property Owner...' : 'Lookup Property Owner'}</ListItemText>
                </MenuItem> */}
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
            </Menu>
        </Box>
    );
}
