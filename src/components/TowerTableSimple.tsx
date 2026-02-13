'use client';

import * as React from 'react';
import { Box, Button, Menu, MenuItem, ListItemIcon, ListItemText, Chip, Badge, TextField, Stack, Typography } from '@mui/material';
import { DataGrid, GridColDef, GridToolbar, GridRenderCellParams, GridCellEditStopReasons, GridFooterContainer, GridPagination, GridSlotsComponentsProps } from '@mui/x-data-grid';
import MapIcon from '@mui/icons-material/Map';
import BusinessIcon from '@mui/icons-material/Business';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StreetviewIcon from '@mui/icons-material/Streetview';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import InfoIcon from '@mui/icons-material/Info';
import NotesIcon from '@mui/icons-material/Notes';
import { getStatusLabel } from '@/lib/constants';

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
        licensees: string[];
        statuses: string[];
    };
    lookups?: {
        types: LookupItem[];
        carriers: LookupItem[];
        licensees: LookupItem[];
    };
    onFilterChange: (filters: { city?: string; state?: string; county?: string; zip?: string; type?: string; licensee?: string; status?: string; address?: string }) => void;
    onCellEdit?: (towerId: number, field: string, value: string) => void;
    onNotesClick?: (tower: any) => void;
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
    filterOptions,
    lookups,
    onFilterChange,
    onCellEdit,
    onNotesClick
}: TowerTableSimpleProps) {
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const [selectedTower, setSelectedTower] = React.useState<any>(null);
    const [jumpPage, setJumpPage] = React.useState<string>('');

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
                            sx={{ width: 40, '& .MuiInputBase-input': { textAlign: 'center' } }}
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
        // Extract all filter values from the DataGrid filter model
        const filters: { city?: string; state?: string; county?: string; zip?: string; type?: string; licensee?: string; status?: string; address?: string } = {};

        if (filterModel.items && filterModel.items.length > 0) {
            filterModel.items.forEach((item: any) => {
                if (item.value) {
                    switch (item.field) {
                        case 'city': filters.city = item.value; break;
                        case 'county': filters.county = item.value; break;
                        case 'state': filters.state = item.value; break;
                        case 'zip': filters.zip = item.value; break;
                        case 'type': filters.type = item.value; break;
                        case 'licensee': filters.licensee = item.value; break;
                        case 'status': filters.status = item.value; break;
                        case 'address': filters.address = item.value; break;
                    }
                }
            });
        }

        onFilterChange(filters);
    };

    const columns: GridColDef[] = [
        {
            field: 'licensee', headerName: 'Licensee', width: 150,
            type: 'singleSelect',
            editable: !!onCellEdit,
            valueOptions: filterOptions.licensees,
            valueGetter: (value: any) => typeof value === 'object' ? value?.name : (value || '')
        },
        {
            field: 'type', headerName: 'Type', width: 120,
            type: 'singleSelect',
            editable: !!onCellEdit,
            valueOptions: filterOptions.types,
            valueGetter: (value: any) => typeof value === 'object' ? value?.name : (value || '')
        },
        {
            field: 'status',
            headerName: 'Status',
            width: 180,
            type: 'singleSelect',
            editable: !!onCellEdit,
            valueOptions: filterOptions.statuses,
            renderCell: (params: GridRenderCellParams) => (
                <Chip
                    label={getStatusLabel(params.value || 'Unknown')}
                    size="small"
                    color="primary"
                    variant="outlined"
                />
            )
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
            headerName: 'Province',
            width: 100,
            type: 'singleSelect',
            valueOptions: filterOptions.states
        },
        {
            field: 'zip',
            headerName: 'Postal Code',
            width: 100,
            type: 'singleSelect',
            valueOptions: filterOptions.zips
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

    return (
        <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Removed Top Bar */}
            <DataGrid
                rows={towers}
                columns={columns}
                rowCount={totalCount}
                paginationMode="server"
                filterMode="server"
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
                processRowUpdate={(newRow, oldRow) => {
                    // Find which field changed
                    const editableFields = ['type', 'licensee', 'carrier', 'status'];
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
                        showQuickFilter: true,
                    },
                }}
                disableRowSelectionOnClick
                loading={isLoading}
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
                <MenuItem onClick={handleGetOwner} disabled={isOwnerLoading}>
                    <ListItemIcon>
                        <BusinessIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{isOwnerLoading ? 'Loading Owner...' : 'Lookup Owner'}</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleOpenBingMaps}>
                    <ListItemIcon>
                        <TravelExploreIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Search Nearby (Bing)</ListItemText>
                </MenuItem>
            </Menu>
        </Box>
    );
}
