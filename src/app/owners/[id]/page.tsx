'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {
    Box, Paper, Typography, Button, IconButton, Divider,
    TextField, Select, MenuItem, FormControl, InputLabel,
    CircularProgress, Chip, Table, TableHead, TableRow,
    TableCell, TableBody, Stack, Switch, FormControlLabel
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import MapIcon from '@mui/icons-material/Map';
import TableRowsIcon from '@mui/icons-material/TableRows';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';

interface Contact {
    id?: number;
    type: string;
    value: string;
    label: string;
    isValid: boolean;
}

interface OwnerTower {
    id: number;
    lat: number;
    lon: number;
    type: string;
    licensee: string;
    status: string;
    source: string;
    address: string;
    city: string;
    state: string;
    notesCount: number;
}

interface Owner {
    id: number;
    name: string;
    type: string | null;
    address: string | null;
    contacts: Contact[];
    towers: OwnerTower[];
    createdAt: string;
    updatedAt: string;
}

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function OwnerDetailPage({ params }: PageProps) {
    const resolvedParams = use(params);
    const ownerId = parseInt(resolvedParams.id);
    const router = useRouter();

    const [owner, setOwner] = useState<Owner | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Edit form state
    const [editName, setEditName] = useState('');
    const [editType, setEditType] = useState('');
    const [editAddress, setEditAddress] = useState('');
    const [editContacts, setEditContacts] = useState<Contact[]>([]);

    useEffect(() => {
        loadOwner();
    }, [ownerId]);

    const loadOwner = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`/api/owners/${ownerId}`);
            setOwner(res.data);
            setEditName(res.data.name);
            setEditType(res.data.type || '');
            setEditAddress(res.data.address || '');
            setEditContacts(res.data.contacts.map((c: any) => ({
                id: c.id,
                type: c.type,
                value: c.value,
                label: c.label || '',
                isValid: c.isValid
            })));
        } catch (error) {
            console.error('Failed to load owner:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.patch(`/api/owners/${ownerId}`, {
                name: editName,
                type: editType || null,
                address: editAddress || null,
                contacts: editContacts.filter(c => c.value.trim()).map(c => ({
                    type: c.type,
                    value: c.value,
                    label: c.label || null,
                    isValid: c.isValid
                }))
            });
            setEditing(false);
            loadOwner();
        } catch (error) {
            console.error('Failed to save owner:', error);
        } finally {
            setSaving(false);
        }
    };

    const addContact = () => {
        setEditContacts([...editContacts, { type: 'Phone', value: '', label: '', isValid: true }]);
    };

    const removeContact = (index: number) => {
        setEditContacts(editContacts.filter((_, i) => i !== index));
    };

    const updateContact = (index: number, field: keyof Contact, value: any) => {
        const updated = [...editContacts];
        updated[index] = { ...updated[index], [field]: value };
        setEditContacts(updated);
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!owner) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography variant="h6">Property Owner not found</Typography>
                <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/owners')} sx={{ mt: 2 }}>
                    Back to Property Owners
                </Button>
            </Box>
        );
    }

    const phones = owner.contacts.filter(c => c.type === 'Phone');
    const emails = owner.contacts.filter(c => c.type === 'Email');

    return (
        <Box sx={{ height: '100%', overflow: 'auto', p: 3, backgroundColor: '#f5f5f5' }}>
            <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                    <IconButton onClick={() => router.push('/owners')}>
                        <ArrowBackIcon />
                    </IconButton>
                    <Typography variant="h4" sx={{ fontWeight: 600, flex: 1 }}>
                        <PersonIcon sx={{ verticalAlign: 'text-bottom', mr: 1 }} />
                        {owner.name}
                    </Typography>
                    {owner.type && (
                        <Chip label={owner.type} color="primary" variant="outlined" />
                    )}
                    {!editing ? (
                        <Button startIcon={<EditIcon />} onClick={() => setEditing(true)} variant="outlined">
                            Edit
                        </Button>
                    ) : (
                        <Stack direction="row" spacing={1}>
                            <Button startIcon={<SaveIcon />} onClick={handleSave} variant="contained" disabled={saving}>
                                {saving ? 'Saving...' : 'Save'}
                            </Button>
                            <Button startIcon={<CancelIcon />} onClick={() => {
                                setEditing(false);
                                setEditName(owner.name);
                                setEditType(owner.type || '');
                                setEditAddress(owner.address || '');
                                setEditContacts(owner.contacts.map(c => ({
                                    id: c.id, type: c.type, value: c.value, label: c.label || '', isValid: c.isValid
                                })));
                            }}>
                                Cancel
                            </Button>
                        </Stack>
                    )}
                </Box>

                {/* Owner Info */}
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>Property Owner Information</Typography>
                    <Divider sx={{ mb: 2 }} />

                    {editing ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <TextField
                                label="Name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                fullWidth
                            />
                            <FormControl fullWidth>
                                <InputLabel>Type</InputLabel>
                                <Select value={editType} label="Type" onChange={(e) => setEditType(e.target.value)}>
                                    <MenuItem value="">None</MenuItem>
                                    <MenuItem value="Individual">Individual</MenuItem>
                                    <MenuItem value="LLC">LLC</MenuItem>
                                    <MenuItem value="Trust">Trust</MenuItem>
                                    <MenuItem value="Corp">Corporation</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField
                                label="Mailing Address"
                                value={editAddress}
                                onChange={(e) => setEditAddress(e.target.value)}
                                fullWidth
                                multiline
                                rows={2}
                            />
                        </Box>
                    ) : (
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                            <Box>
                                <Typography variant="body2" color="text.secondary">Name</Typography>
                                <Typography variant="body1">{owner.name}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="body2" color="text.secondary">Type</Typography>
                                <Typography variant="body1">{owner.type || 'N/A'}</Typography>
                            </Box>
                            <Box sx={{ gridColumn: '1 / -1' }}>
                                <Typography variant="body2" color="text.secondary">Mailing Address</Typography>
                                <Typography variant="body1">{owner.address || 'N/A'}</Typography>
                            </Box>
                        </Box>
                    )}
                </Paper>

                {/* Contacts */}
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Contacts</Typography>
                        {editing && (
                            <Button startIcon={<AddIcon />} size="small" onClick={addContact}>
                                Add Contact
                            </Button>
                        )}
                    </Box>
                    <Divider sx={{ mb: 2 }} />

                    {editing ? (
                        <Stack spacing={1}>
                            {editContacts.map((contact, index) => (
                                <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                    <FormControl size="small" sx={{ minWidth: 100 }}>
                                        <Select
                                            value={contact.type}
                                            onChange={(e) => updateContact(index, 'type', e.target.value)}
                                        >
                                            <MenuItem value="Phone">Phone</MenuItem>
                                            <MenuItem value="Email">Email</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <TextField
                                        size="small"
                                        placeholder={contact.type === 'Phone' ? 'Phone number' : 'Email address'}
                                        value={contact.value}
                                        onChange={(e) => updateContact(index, 'value', e.target.value)}
                                        sx={{ flex: 1 }}
                                    />
                                    <TextField
                                        size="small"
                                        placeholder="Label"
                                        value={contact.label}
                                        onChange={(e) => updateContact(index, 'label', e.target.value)}
                                        sx={{ width: 120 }}
                                    />
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={contact.isValid}
                                                onChange={(e) => updateContact(index, 'isValid', e.target.checked)}
                                                size="small"
                                            />
                                        }
                                        label="Valid"
                                        sx={{ minWidth: 80 }}
                                    />
                                    <IconButton size="small" onClick={() => removeContact(index)} color="error">
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            ))}
                            {editContacts.length === 0 && (
                                <Typography variant="body2" color="text.secondary" fontStyle="italic">
                                    No contacts. Click "Add Contact" to add one.
                                </Typography>
                            )}
                        </Stack>
                    ) : (
                        <>
                            {phones.length > 0 && (
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                        <PhoneIcon fontSize="small" sx={{ verticalAlign: 'text-bottom', mr: 0.5 }} />
                                        Phones
                                    </Typography>
                                    {phones.map((p, i) => (
                                        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 3, mb: 0.5 }}>
                                            <Typography variant="body1">{p.value}</Typography>
                                            {p.label && <Chip label={p.label} size="small" variant="outlined" />}
                                            {!p.isValid && <Chip label="Invalid" size="small" color="error" />}
                                        </Box>
                                    ))}
                                </Box>
                            )}
                            {emails.length > 0 && (
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                        <EmailIcon fontSize="small" sx={{ verticalAlign: 'text-bottom', mr: 0.5 }} />
                                        Emails
                                    </Typography>
                                    {emails.map((e, i) => (
                                        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 3, mb: 0.5 }}>
                                            <Typography variant="body1">{e.value}</Typography>
                                            {e.label && <Chip label={e.label} size="small" variant="outlined" />}
                                            {!e.isValid && <Chip label="Invalid" size="small" color="error" />}
                                        </Box>
                                    ))}
                                </Box>
                            )}
                            {phones.length === 0 && emails.length === 0 && (
                                <Typography variant="body2" color="text.secondary" fontStyle="italic">
                                    No contacts recorded.
                                </Typography>
                            )}
                        </>
                    )}
                </Paper>

                {/* Associated Towers */}
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Associated Towers ({owner.towers?.length || 0})
                    </Typography>
                    <Divider sx={{ mb: 2 }} />

                    {owner.towers && owner.towers.length > 0 ? (
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>ID</TableCell>
                                    <TableCell>Type</TableCell>
                                    <TableCell>Licensee</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Address</TableCell>
                                    <TableCell>City</TableCell>
                                    <TableCell>Source</TableCell>
                                    <TableCell>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {owner.towers.map((tower) => (
                                    <TableRow key={tower.id} hover>
                                        <TableCell>{tower.id}</TableCell>
                                        <TableCell>{tower.type}</TableCell>
                                        <TableCell>{tower.licensee}</TableCell>
                                        <TableCell>
                                            <Chip label={tower.status} size="small" variant="outlined" />
                                        </TableCell>
                                        <TableCell>{tower.address}</TableCell>
                                        <TableCell>{tower.city}</TableCell>
                                        <TableCell>{tower.source}</TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={0.5}>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => router.push(`/towers/${tower.id}`)}
                                                    title="View Details"
                                                >
                                                    <TableRowsIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => router.push(`/?selectTower=${tower.id}`)}
                                                    title="See in Map"
                                                >
                                                    <MapIcon fontSize="small" />
                                                </IconButton>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <Typography variant="body2" color="text.secondary" fontStyle="italic">
                            No towers associated with this property owner.
                        </Typography>
                    )}
                </Paper>
            </Box>
        </Box>
    );
}
