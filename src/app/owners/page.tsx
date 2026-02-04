'use client';

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { DataGrid, GridColDef, GridToolbar, GridActionsCellItem } from '@mui/x-data-grid';
import MapIcon from '@mui/icons-material/Map';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import CircularProgress from '@mui/material/CircularProgress';

interface OwnerRow {
    id: string; // Unique ID for the row (e.g. Parcel ID + Owner Name hash)
    ownerName: string;
    parcelId: string;
    address: string;
    towerCount: number; // How many towers on this land
    towerIds: string; // Comma separated IDs
}

export default function OwnersPage() {
    const [rows, setRows] = useState<OwnerRow[]>([]);
    const [totalRows, setTotalRows] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [paginationModel, setPaginationModel] = useState({
        page: 0,
        pageSize: 25,
    });
    const router = useRouter();

    useEffect(() => {
        const fetchOwners = async () => {
            setLoading(true);
            try {
                const res = await axios.get(`/api/owners?page=${paginationModel.page}&limit=${paginationModel.pageSize}`);

                // Convert towerIds array to comma-separated string for display
                const formattedRows = res.data.data.map((row: any) => ({
                    ...row,
                    towerIds: Array.isArray(row.towerIds) ? row.towerIds.join(', ') : row.towerIds
                }));

                setRows(formattedRows);
                setTotalRows(res.data.total);
            } catch (error) {
                console.error("Failed to fetch owners:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchOwners();
    }, [paginationModel.page, paginationModel.pageSize]);

    const handleSeeInMap = (row: OwnerRow) => {
        // Build query params to center map
        // We need coordinates. Since we grouped by owner, we might need to store lat/lon of *one* tower.
        // Let's assume we can get it from the 'towerIds'. 
        // Actually, better to store average lat/lon in the row during fetching.

        // For now, let's just use the first tower ID to find it in the map page logic.
        // We can pass ?towerId=123 to the map page.

        const firstTowerId = row.towerIds.split(',')[0].trim();
        router.push(`/?selectTower=${firstTowerId}`);
    };

    const columns: GridColDef[] = [
        { field: 'ownerName', headerName: 'Owner Name', flex: 1, minWidth: 200 },
        { field: 'parcelId', headerName: 'Parcel ID', width: 150 },
        { field: 'address', headerName: 'Property Address', flex: 1, minWidth: 200 },
        { field: 'towerCount', headerName: 'Towers', width: 100, type: 'number' },
        {
            field: 'actions',
            type: 'actions',
            headerName: 'Actions',
            width: 100,
            getActions: ({ row }) => [
                <GridActionsCellItem
                    key="map"
                    icon={<MapIcon />}
                    label="See in Map"
                    onClick={() => handleSeeInMap(row as OwnerRow)}
                />
            ]
        },
    ];

    return (
        <Box sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h4" gutterBottom fontWeight="bold">
                Land Owners
            </Typography>
            <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                Properties identified with cellular towers.
            </Typography>
            <Paper sx={{ flex: 1, mt: 2, p: 2, width: '100%' }} elevation={2}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <DataGrid
                        rows={rows}
                        columns={columns}
                        rowCount={totalRows}
                        loading={loading}
                        paginationMode="server"
                        paginationModel={paginationModel}
                        onPaginationModelChange={setPaginationModel}
                        pageSizeOptions={[25, 50, 100]}
                        slots={{ toolbar: GridToolbar }}
                        slotProps={{
                            toolbar: {
                                showQuickFilter: true,
                            },
                        }}
                        checkboxSelection
                    />
                )}
            </Paper>
        </Box>
    );
}
