'use client';
import { useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Box from '@mui/material/Box';
import axios from 'axios';
import { Paper, Typography } from '@mui/material';
import TowerTableSimple from '@/components/TowerTableSimple';

interface Tower {
    id: number;
    type: string;
    subType?: string;
    lat: number;
    lon: number;
    details?: any;
    parcel?: any;
    licensee?: string;
    status?: string;
    source?: string;
    // Flattened fields for DataGrid
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    parcelId?: string;
    ownerName?: string;
    dataSource?: string;
}

interface OwnerResult {
    result: {
        owner: string;
        address: string;
        parcel_id: string;
        geometry: any;
        [key: string]: any;
    } | null;
}

function TowersPageContent() {
    const router = useRouter();

    const [towers, setTowers] = useState<Tower[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [page, setPage] = useState<number>(0);
    const [rowsPerPage, setRowsPerPage] = useState<number>(25);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [selectedTower, setSelectedTower] = useState<Tower | null>(null);
    const [isOwnerLoading, setIsOwnerLoading] = useState<boolean>(false);
    const [filterOptions, setFilterOptions] = useState<{
        cities: string[];
        states: string[];
        zips: string[];
    }>({ cities: [], states: [], zips: [] });
    const [filters, setFilters] = useState<{
        city?: string;
        state?: string;
        zip?: string;
    }>({});

    // Load distinct filter values on mount
    useEffect(() => {
        const loadFilterOptions = async () => {
            try {
                const res = await axios.get('/api/towers?distinct=filters');
                setFilterOptions({
                    cities: res.data.cities || [],
                    states: res.data.states || [],
                    zips: res.data.zips || []
                });
            } catch (error) {
                console.error("Failed to fetch filter options:", error);
            }
        };
        loadFilterOptions();
    }, []);

    // Load towers with pagination and filters
    useEffect(() => {
        const loadTowers = async () => {
            setIsLoading(true);
            try {
                // Build query string with filters
                const params = new URLSearchParams({
                    page: page.toString(),
                    limit: rowsPerPage.toString()
                });

                if (filters.city) params.append('city', filters.city);
                if (filters.state) params.append('state', filters.state);
                if (filters.zip) params.append('zip', filters.zip);

                const res = await axios.get(`/api/towers?${params.toString()}`);

                // Flatten the data structure for better DataGrid filtering
                const flattenedTowers = (res.data.data || []).map((tower: any) => ({
                    ...tower,
                    address: tower.parcel?.address || '',
                    city: tower.parcel?.city || '',
                    state: tower.parcel?.state || '',
                    zip: tower.parcel?.zip || '',
                    parcelId: tower.parcel?.parcelId || '',
                    ownerName: tower.parcel?.owner?.name || '',
                    dataSource: tower.parcel?.dataSource || ''
                }));

                setTowers(flattenedTowers);
                setTotalCount(res.data.total || 0);
            } catch (error) {
                console.error("Failed to fetch towers:", error);
            } finally {
                setIsLoading(false);
            }
        };
        loadTowers();
    }, [page, rowsPerPage, filters]);

    const handleLookupOwner = async (tower: Tower) => {
        setIsOwnerLoading(true);
        try {
            const res = await axios.get(`/api/owner?lat=${tower.lat}&lon=${tower.lon}`);

            if (res.data.result?._parcel) {
                const parcelData = res.data.result._parcel;

                // Extract owner name, making sure it's not a parcel ID or generic value
                let ownerName = '';
                if (parcelData.owner?.name) {
                    ownerName = parcelData.owner.name;
                } else if (res.data.result.owner && res.data.result.owner !== 'Unknown' && res.data.result.owner !== 'UNKNOWN') {
                    ownerName = res.data.result.owner;
                }

                // Don't use parcel ID as owner name
                if (ownerName && ownerName === parcelData.parcelId) {
                    console.warn('Owner name matches parcel ID, clearing owner name');
                    ownerName = '';
                }

                // Update both nested and flattened fields
                const updatedTower = {
                    ...tower,
                    parcel: parcelData,
                    // Update flattened fields for DataGrid
                    address: parcelData.address || tower.address || '',
                    city: parcelData.city || tower.city || '',
                    state: parcelData.state || tower.state || '',
                    zip: parcelData.zip || tower.zip || '',
                    parcelId: parcelData.parcelId || tower.parcelId || '',
                    ownerName: ownerName || '',
                    dataSource: parcelData.dataSource || tower.dataSource || ''
                };

                setTowers(prevTowers => prevTowers.map(t => t.id === tower.id ? updatedTower : t));

                if (ownerName) {
                    alert(`Owner found: ${ownerName}`);
                } else {
                    alert('Parcel found, but owner information is not available');
                }
            } else {
                alert("No parcel data found for this location.");
            }
        } catch (error) {
            console.error("Owner lookup failed:", error);
            alert("Could not fetch owner data.");
        } finally {
            setIsOwnerLoading(false);
        }
    };

    const handleViewOnMap = (tower: Tower) => {
        // Navigate to map page with tower selected
        router.push(`/?selectTower=${tower.id}`);
    };

    return (
        <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden', flexDirection: 'column' }}>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2, backgroundColor: '#f5f5f5', overflow: 'hidden' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>Towers List</Typography>
                    {isLoading && <Typography variant="body2" color="text.secondary">Loading...</Typography>}
                </Box>
                <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <TowerTableSimple
                        towers={towers}
                        totalCount={totalCount}
                        page={page}
                        rowsPerPage={rowsPerPage}
                        onPageChange={setPage}
                        onRowsPerPageChange={setRowsPerPage}
                        onViewOnMap={handleViewOnMap}
                        onGetOwner={handleLookupOwner}
                        isOwnerLoading={isOwnerLoading}
                        filterOptions={filterOptions}
                        onFilterChange={(newFilters) => {
                            setFilters(newFilters);
                            setPage(0); // Reset to first page when filters change
                        }}
                    />
                </Paper>
            </Box>
        </Box>
    );
}

export default function TowersPage() {
    return (
        <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</Box>}>
            <TowersPageContent />
        </Suspense>
    );
}
