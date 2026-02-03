'use client';

import * as React from 'react';
import { DataGrid, GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';
import { Box, Paper } from '@mui/material';

interface TowerTableProps {
    towers: any[];
    onRowSelect: (tower: any) => void;
}

const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'licensee', headerName: 'Licensee', width: 250 },
    { field: 'type', headerName: 'Type', width: 130 },
    { field: 'status', headerName: 'Status', width: 130 },
    {
        field: 'address',
        headerName: 'Address',
        width: 350,
        valueGetter: (value, row) => row.parcel?.address || ''
    },
    {
        field: 'city',
        headerName: 'City',
        width: 150,
        valueGetter: (value, row) => row.parcel?.city || ''
    },
    {
        field: 'state',
        headerName: 'State',
        width: 100,
        valueGetter: (value, row) => row.parcel?.state || ''
    },
    {
        field: 'zip',
        headerName: 'ZIP',
        width: 100,
        valueGetter: (value, row) => row.parcel?.zip || ''
    },
    {
        field: 'lat',
        headerName: 'Latitude',
        type: 'number',
        width: 120,
    },
    {
        field: 'lon',
        headerName: 'Longitude',
        type: 'number',
        width: 120,
    },
    {
        field: 'googleMapsUrl',
        headerName: 'Google Maps',
        width: 120,
        renderCell: (params) => params.value ? (
            <a href={params.value} target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
                View Map
            </a>
        ) : null
    },
    {
        field: 'parcelId',
        headerName: 'Parcel ID',
        width: 150,
        valueGetter: (value, row) => row.parcel?.parcelId || ''
    },
    {
        field: 'ownerName',
        headerName: 'Owner',
        width: 200,
        valueGetter: (value, row) => row.parcel?.owner?.name || ''
    },
    {
        field: 'dataSource',
        headerName: 'Data Source',
        width: 130,
        valueGetter: (value, row) => row.parcel?.dataSource || ''
    },
];

export default function TowerTable({ towers, onRowSelect }: TowerTableProps) {
    const [selectionModel, setSelectionModel] = React.useState<any>([]);

    const handleRowSelection = (newSelection: any) => {
        setSelectionModel(newSelection);
        if (Array.isArray(newSelection) && newSelection.length > 0) {
            const selectedId = newSelection[0];
            const selectedTower = towers.find(t => t.id === selectedId);
            if (selectedTower) {
                onRowSelect(selectedTower);
            }
        }
    };

    return (
        <Box sx={{ height: '100%', width: '100%' }}>
            <Paper sx={{ height: '100%', width: '100%' }}>
                <DataGrid
                    rows={towers || []}
                    columns={columns}
                    initialState={{
                        pagination: {
                            paginationModel: { page: 0, pageSize: 100 },
                        },
                    }}
                    pageSizeOptions={[10, 50, 100]}
                    rowSelectionModel={selectionModel}
                    onRowSelectionModelChange={handleRowSelection}
                    sx={{
                        '& .MuiDataGrid-virtualScroller': {
                            overflowX: 'auto',
                        },
                    }}
                />
            </Paper>
        </Box>
    );
}
