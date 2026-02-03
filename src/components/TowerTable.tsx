'use client';

import * as React from 'react';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { Box, Paper } from '@mui/material';

interface TowerTableProps {
    towers: any[];
}

const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'licensee', headerName: 'Licensee', width: 200 },
    { field: 'type', headerName: 'Type', width: 130 },
    { field: 'status', headerName: 'Status', width: 130 },
    {
        field: 'address',
        headerName: 'Address',
        width: 300,
        valueGetter: (value, row) => row.parcel?.address || ''
    },
    {
        field: 'lat',
        headerName: 'Latitude',
        type: 'number',
        width: 110,
    },
    {
        field: 'lon',
        headerName: 'Longitude',
        type: 'number',
        width: 110,
    },
];

export default function TowerTable({ towers }: TowerTableProps) {
    return (
        <Box sx={{ height: '100%', width: '100%' }}>
            <Paper sx={{ height: '100%', width: '100%' }}>
                <DataGrid
                    rows={towers}
                    columns={columns}
                    initialState={{
                        pagination: {
                            paginationModel: { page: 0, pageSize: 100 },
                        },
                    }}
                    pageSizeOptions={[10, 50, 100]}
                    checkboxSelection
                    disableRowSelectionOnClick
                />
            </Paper>
        </Box>
    );
}
