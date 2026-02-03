'use client';

import * as React from 'react';
import {
    Box,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TablePagination,
    Checkbox
} from '@mui/material';

interface TowerTableSimpleProps {
    towers: any[];
    onRowSelect: (tower: any) => void;
}

export default function TowerTableSimple({ towers, onRowSelect }: TowerTableSimpleProps) {
    const [page, setPage] = React.useState(0);
    const [rowsPerPage, setRowsPerPage] = React.useState(25);
    const [selectedId, setSelectedId] = React.useState<number | null>(null);

    const handleChangePage = (event: unknown, newPage: number) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    const handleRowClick = (tower: any) => {
        setSelectedId(tower.id);
        onRowSelect(tower);
    };

    if (!towers || !Array.isArray(towers)) {
        return (
            <Box sx={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Paper sx={{ p: 3 }}>
                    Loading towers...
                </Paper>
            </Box>
        );
    }

    const paginatedTowers = towers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    return (
        <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
            <TableContainer component={Paper} sx={{ flex: 1, overflow: 'auto' }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>ID</TableCell>
                            <TableCell>Licensee</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Address</TableCell>
                            <TableCell>City</TableCell>
                            <TableCell>State</TableCell>
                            <TableCell>ZIP</TableCell>
                            <TableCell>Latitude</TableCell>
                            <TableCell>Longitude</TableCell>
                            <TableCell>Google Maps</TableCell>
                            <TableCell>Parcel ID</TableCell>
                            <TableCell>Owner</TableCell>
                            <TableCell>Data Source</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {paginatedTowers.map((tower) => (
                            <TableRow
                                key={tower.id}
                                hover
                                selected={selectedId === tower.id}
                                onClick={() => handleRowClick(tower)}
                                sx={{ cursor: 'pointer' }}
                            >
                                <TableCell>{tower.id}</TableCell>
                                <TableCell>{tower.licensee || ''}</TableCell>
                                <TableCell>{tower.type || ''}</TableCell>
                                <TableCell>{tower.status || ''}</TableCell>
                                <TableCell>{tower.parcel?.address || ''}</TableCell>
                                <TableCell>{tower.parcel?.city || ''}</TableCell>
                                <TableCell>{tower.parcel?.state || ''}</TableCell>
                                <TableCell>{tower.parcel?.zip || ''}</TableCell>
                                <TableCell>{tower.lat?.toFixed(6)}</TableCell>
                                <TableCell>{tower.lon?.toFixed(6)}</TableCell>
                                <TableCell>
                                    {tower.googleMapsUrl && (
                                        <a href={tower.googleMapsUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
                                            View
                                        </a>
                                    )}
                                </TableCell>
                                <TableCell>{tower.parcel?.parcelId || ''}</TableCell>
                                <TableCell>{tower.parcel?.owner?.name || ''}</TableCell>
                                <TableCell>{tower.parcel?.dataSource || ''}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination
                component="div"
                count={towers.length}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[25, 50, 100]}
            />
        </Box>
    );
}
