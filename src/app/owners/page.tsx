'use client';

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { DataGrid, GridColDef, GridToolbar, GridActionsCellItem } from '@mui/x-data-grid';
import MapIcon from '@mui/icons-material/Map';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { CircularProgress, TextField, MenuItem, Button, Autocomplete, Checkbox, Badge, Chip } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { useCountry } from '@/lib/country-context';

interface OwnerRow {
    id: string;
    ownerId: number | null;
    ownerName: string;
    ownerType: string;
    ownerAddress: string;
    parcelId: string;
    address: string;
    city: string;
    county: string;
    state: string;
    zip: string;
    phones: string[];
    emails: string[];
    towerCount: number;
    towerIds: string;
}

export default function OwnersPage() {
    const [rows, setRows] = useState<OwnerRow[]>([]);
    const [totalRows, setTotalRows] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [paginationModel, setPaginationModel] = useState({
        page: 0,
        pageSize: 25,
    });
    const [filterOptions, setFilterOptions] = useState<{
        cities: string[];
        states: string[];
        counties: string[];
        zips: string[];
    }>({ cities: [], states: [], counties: [], zips: [] });
    const [filters, setFilters] = useState<{
        city?: string;
        state?: string;
        county?: string;
        zip?: string;
    }>({});
    const router = useRouter();
    const { country: globalCountry } = useCountry();

    // Load distinct filter values (re-fetch when country changes)
    useEffect(() => {
        const loadFilterOptions = async () => {
            try {
                const countryParam = globalCountry ? `&country=${encodeURIComponent(globalCountry)}` : '';
                const res = await axios.get(`/api/owners?distinct=filters${countryParam}`);
                setFilterOptions({
                    cities: res.data.cities || [],
                    states: res.data.states || [],
                    counties: res.data.counties || [],
                    zips: res.data.zips || []
                });
            } catch (error) {
                console.error("Failed to fetch filter options:", error);
            }
        };
        loadFilterOptions();
    }, [globalCountry]);

    useEffect(() => {
        const fetchOwners = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({
                    page: paginationModel.page.toString(),
                    limit: paginationModel.pageSize.toString()
                });

                if (globalCountry) params.append('country', globalCountry);
                if (filters.city) params.append('city', filters.city);
                if (filters.county) params.append('county', filters.county);
                if (filters.state) params.append('state', filters.state);
                if (filters.zip) params.append('zip', filters.zip);

                const res = await axios.get(`/api/owners?${params.toString()}`);

                // Convert towerIds array to comma-separated string for display
                const formattedRows = res.data.data.map((row: any) => ({
                    ...row,
                    city: row.city || '',
                    county: row.county || '',
                    state: row.state || '',
                    zip: row.zip || '',
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
    }, [paginationModel.page, paginationModel.pageSize, filters, globalCountry]);

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

    const handleFilterModelChange = (filterModel: any) => {
        const newFilters: { city?: string; state?: string; county?: string; zip?: string } = {};

        if (filterModel.items && filterModel.items.length > 0) {
            filterModel.items.forEach((item: any) => {
                if (item.field === 'city' && item.value) {
                    newFilters.city = item.value;
                } else if (item.field === 'state' && item.value) {
                    newFilters.state = item.value;
                } else if (item.field === 'county' && item.value) {
                    newFilters.county = item.value;
                } else if (item.field === 'zip' && item.value) {
                    newFilters.zip = item.value;
                }
            });
        }

        setFilters(newFilters);
        setPaginationModel(prev => ({ ...prev, page: 0 })); // Reset to first page
    };

    const columns: GridColDef[] = [
        {
            field: 'ownerName',
            headerName: 'Property Owner Name',
            flex: 1,
            minWidth: 200,
            renderCell: (params) => (
                params.row.ownerId ? (
                    <Box
                        component="a"
                        href={`/owners/${params.row.ownerId}`}
                        sx={{ color: '#2196f3', textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, cursor: 'pointer' }}
                    >
                        {params.value}
                    </Box>
                ) : params.value
            )
        },
        { field: 'ownerType', headerName: 'Type', width: 100 },
        { field: 'parcelId', headerName: 'Parcel ID', width: 150 },
        { field: 'address', headerName: 'Property Address', flex: 1, minWidth: 200 },
        {
            field: 'phones',
            headerName: 'Phones',
            width: 150,
            valueGetter: (value: any) => Array.isArray(value) ? value.join(', ') : ''
        },
        {
            field: 'emails',
            headerName: 'Emails',
            width: 180,
            valueGetter: (value: any) => Array.isArray(value) ? value.join(', ') : ''
        },
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
            headerName: globalCountry === 'USA' ? 'State' : 'Province',
            width: 80,
            type: 'singleSelect',
            valueOptions: filterOptions.states
        },
        {
            field: 'zip',
            headerName: globalCountry === 'USA' ? 'ZIP' : 'Postal Code',
            width: 90,
            type: 'singleSelect',
            valueOptions: filterOptions.zips
        },
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

    const handleExternalFilterChange = (field: string, values: string[]) => {
        const newFilters = { ...filters, [field]: values.join(',') };
        if (!values.length) delete (newFilters as any)[field];
        setFilters(newFilters);
        setPaginationModel(prev => ({ ...prev, page: 0 }));
    };

    const removeFilterValue = (field: string, valueToRemove: string) => {
        const current = ((filters as any)[field] || '').split(',').filter(Boolean);
        const updated = current.filter((v: string) => v !== valueToRemove);
        handleExternalFilterChange(field, updated);
    };

    const activeFilterCount = Object.values(filters).filter(v => v && v.length > 0).length;

    const activeChips: { field: string; label: string; value: string }[] = [];
    const fieldLabels: Record<string, string> = {
        city: 'City', county: 'County',
        state: globalCountry === 'USA' ? 'State' : 'Province',
        zip: globalCountry === 'USA' ? 'ZIP' : 'Postal Code'
    };
    for (const [field, label] of Object.entries(fieldLabels)) {
        const val = (filters as any)[field];
        if (val) {
            val.split(',').filter(Boolean).forEach((v: string) => {
                activeChips.push({ field, label, value: v });
            });
        }
    }

    const FilterAutocomplete = ({ field, label, options }: { field: string; label: string; options: string[] }) => {
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
                            <Checkbox icon={<CheckBoxOutlineBlankIcon fontSize="small" />} checkedIcon={<CheckBoxIcon fontSize="small" />} style={{ marginRight: 8 }} checked={sel} size="small" />
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
                            minWidth: 140,
                            '& .MuiInputLabel-root': {
                                color: selected.length ? 'primary.main' : undefined,
                                fontWeight: selected.length ? 600 : 400,
                            }
                        }}
                    />
                )}
                sx={{ minWidth: 140 }}
            />
        );
    };

    const ExternalFiltersBar = () => (
        <Box sx={{ borderBottom: '1px solid #e0e0e0', mb: 1 }}>
            <Box sx={{ pb: 1, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <Badge badgeContent={activeFilterCount} color="primary" sx={{ mr: 0.5 }}>
                    <FilterListIcon color={activeFilterCount > 0 ? 'primary' : 'action'} />
                </Badge>
                <FilterAutocomplete field="city" label="City" options={filterOptions.cities} />
                <FilterAutocomplete field="county" label="County" options={filterOptions.counties} />
                <FilterAutocomplete field="state" label={globalCountry === 'USA' ? 'State' : 'Province'} options={filterOptions.states} />
                <FilterAutocomplete field="zip" label={globalCountry === 'USA' ? 'ZIP' : 'Postal Code'} options={filterOptions.zips} />
                {activeFilterCount > 0 && (
                    <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<ClearIcon />}
                        onClick={() => { setFilters({}); setPaginationModel(prev => ({ ...prev, page: 0 })); }}
                        sx={{ ml: 'auto', textTransform: 'none', fontWeight: 600 }}
                    >
                        Clear All ({activeFilterCount})
                    </Button>
                )}
            </Box>
            {activeChips.length > 0 && (
                <Box sx={{ pb: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
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

    return (
        <Box sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h4" gutterBottom fontWeight="bold">
                Property Owners
            </Typography>
            <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                Properties identified with cellular towers.
            </Typography>
            <Paper sx={{ flex: 1, mt: 2, p: 2, width: '100%', display: 'flex', flexDirection: 'column' }} elevation={2}>
                <ExternalFiltersBar />
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
                        filterMode="server"
                        paginationModel={paginationModel}
                        onPaginationModelChange={setPaginationModel}
                        onFilterModelChange={(model) => {
                            const newFilters = { ...filters };
                            if (model.items && model.items.length > 0) {
                                model.items.forEach((item: any) => {
                                    if (item.value) {
                                        (newFilters as any)[item.field] = item.value;
                                    }
                                });
                            }
                            setFilters(newFilters);
                            setPaginationModel(prev => ({ ...prev, page: 0 }));
                        }}
                        pageSizeOptions={[25, 50, 100]}
                        slots={{ toolbar: GridToolbar }}
                        slotProps={{
                            toolbar: {
                                showQuickFilter: true,
                            },
                        }}
                        checkboxSelection
                        sx={{ flex: 1 }}
                    />
                )}
            </Paper>
        </Box>
    );
}
