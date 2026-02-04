'use client';

import * as React from 'react';
import { Box, Button } from '@mui/material';
import { DataGrid, GridColDef, GridToolbar, GridRenderCellParams } from '@mui/x-data-grid';
import MapIcon from '@mui/icons-material/Map';
import BusinessIcon from '@mui/icons-material/Business';

interface TowerTableSimpleProps {
    towers: any[];
    totalCount: number;
    page: number;
    rowsPerPage: number;
    onPageChange: (page: number) => void;
    onRowsPerPageChange: (rowsPerPage: number) => void;
    onViewOnMap: (tower: any) => void;
    onGetOwner: (tower: any) => void;
    isOwnerLoading: boolean;
    filterOptions: {
        cities: string[];
        states: string[];
        zips: string[];
    };
    onFilterChange: (filters: { city?: string; state?: string; zip?: string }) => void;
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
    isOwnerLoading,
    filterOptions,
    onFilterChange
}: TowerTableSimpleProps) {

    const handleFilterModelChange = (filterModel: any) => {
        // Extract city, state, zip filters from the filter model
        const filters: { city?: string; state?: string; zip?: string } = {};

        if (filterModel.items && filterModel.items.length > 0) {
            filterModel.items.forEach((item: any) => {
                if (item.field === 'city' && item.value) {
                    filters.city = item.value;
                } else if (item.field === 'state' && item.value) {
                    filters.state = item.value;
                } else if (item.field === 'zip' && item.value) {
                    filters.zip = item.value;
                }
            });
        }

        onFilterChange(filters);
    };

    const columns: GridColDef[] = [
        { field: 'id', headerName: 'ID', width: 80 },
        { field: 'licensee', headerName: 'Licensee', width: 150 },
        { field: 'type', headerName: 'Type', width: 120 },
        { field: 'status', headerName: 'Status', width: 100 },
        { field: 'address', headerName: 'Address', width: 200, flex: 1, minWidth: 200 },
        {
            field: 'city',
            headerName: 'City',
            width: 120,
            type: 'singleSelect',
            valueOptions: filterOptions.cities
        },
        {
            field: 'state',
            headerName: 'State',
            width: 80,
            type: 'singleSelect',
            valueOptions: filterOptions.states
        },
        {
            field: 'zip',
            headerName: 'ZIP',
            width: 90,
            type: 'singleSelect',
            valueOptions: filterOptions.zips
        },
        {
            field: 'lat',
            headerName: 'Latitude',
            width: 100,
            valueGetter: (value, row) => row.lat?.toFixed(6) || ''
        },
        {
            field: 'lon',
            headerName: 'Longitude',
            width: 100,
            valueGetter: (value, row) => row.lon?.toFixed(6) || ''
        },
        {
            field: 'actions',
            headerName: 'Actions',
            width: 250,
            sortable: false,
            filterable: false,
            renderCell: (params: GridRenderCellParams) => (
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<MapIcon />}
                        onClick={(e) => {
                            e.stopPropagation();
                            onViewOnMap(params.row);
                        }}
                    >
                        Map
                    </Button>
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={<BusinessIcon />}
                        disabled={isOwnerLoading}
                        onClick={(e) => {
                            e.stopPropagation();
                            onGetOwner(params.row);
                        }}
                    >
                        {isOwnerLoading ? 'Loading' : 'Owner'}
                    </Button>
                </Box>
            )
        },
        { field: 'parcelId', headerName: 'Parcel ID', width: 150 },
        { field: 'ownerName', headerName: 'Owner', width: 150 },
        { field: 'dataSource', headerName: 'Data Source', width: 120 },
    ];

    return (
        <Box sx={{ height: '100%', width: '100%' }}>
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
                pageSizeOptions={[25, 50, 100]}
                slots={{ toolbar: GridToolbar }}
                slotProps={{
                    toolbar: {
                        showQuickFilter: true,
                    },
                }}
                disableRowSelectionOnClick
            />
        </Box>
    );
}
