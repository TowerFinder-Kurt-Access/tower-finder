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
    { field: 'type', headerName: 'Type', width: 130 },
    {
        field: 'status',
        headerName: 'Status',
        width: 150,
        valueGetter: (value, row) => row.status?.name || row.legacyStatus || ''
    },
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
        headerName: 'Property Owner',
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

    // Don't render DataGrid until we have data
    if (!towers || !Array.isArray(towers)) {
        return (
            <Box sx={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Paper sx={{ p: 3 }}>
                    Loading towers...
                </Paper>
            </Box>
        );
    }

    return (
        <Box sx={{ height: '100%', width: '100%' }}>
            <Paper sx={{ height: '100%', width: '100%' }}>
                <DataGrid
                    rows={towers}
                    columns={columns}
                    getRowId={(row) => row.id}
                    pageSizeOptions={[25, 50, 100]}
                    initialState={{
                        pagination: {
                            paginationModel: {
                                pageSize: 25,
                            },
                        },
                    }}
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
