'use client';

import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Select, MenuItem, FormControl, InputLabel,
    IconButton, Box, Typography, Chip, Stack
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import axios from 'axios';

interface Contact {
    type: 'Phone' | 'Email';
    value: string;
    label: string;
}

interface AddOwnerDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: (owner: any) => void;
    towerId?: number;
}

export default function AddOwnerDialog({ open, onClose, onSuccess, towerId }: AddOwnerDialogProps) {
    const [name, setName] = useState('');
    const [type, setType] = useState('');
    const [address, setAddress] = useState('');
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const addContact = () => {
        setContacts([...contacts, { type: 'Phone', value: '', label: '' }]);
    };

    const removeContact = (index: number) => {
        setContacts(contacts.filter((_, i) => i !== index));
    };

    const updateContact = (index: number, field: keyof Contact, value: string) => {
        const updated = [...contacts];
        updated[index] = { ...updated[index], [field]: value };
        setContacts(updated);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            setError('Property Owner name is required');
            return;
        }

        setSaving(true);
        setError('');

        try {
            const validContacts = contacts.filter(c => c.value.trim());
            const res = await axios.post('/api/owners', {
                name: name.trim(),
                type: type || null,
                address: address.trim() || null,
                contacts: validContacts,
                towerId: towerId || null
            });

            onSuccess(res.data);
            handleClose();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to create property owner');
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        setName('');
        setType('');
        setAddress('');
        setContacts([]);
        setError('');
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Add Property Owner{towerId ? ` for Tower #${towerId}` : ''}</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    <TextField
                        label="Property Owner Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        fullWidth
                        autoFocus
                    />

                    <FormControl fullWidth>
                        <InputLabel>Property Owner Type</InputLabel>
                        <Select
                            value={type}
                            label="Property Owner Type"
                            onChange={(e) => setType(e.target.value)}
                        >
                            <MenuItem value="">None</MenuItem>
                            <MenuItem value="Individual">Individual</MenuItem>
                            <MenuItem value="LLC">LLC</MenuItem>
                            <MenuItem value="Trust">Trust</MenuItem>
                            <MenuItem value="Corp">Corporation</MenuItem>
                        </Select>
                    </FormControl>

                    <TextField
                        label="Mailing Address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        fullWidth
                        multiline
                        rows={2}
                    />

                    {/* Contacts Section */}
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography variant="subtitle2">Contacts</Typography>
                            <Button size="small" startIcon={<AddIcon />} onClick={addContact}>
                                Add Contact
                            </Button>
                        </Box>

                        <Stack spacing={1}>
                            {contacts.map((contact, index) => (
                                <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                    <FormControl size="small" sx={{ minWidth: 100 }}>
                                        <Select
                                            value={contact.type}
                                            onChange={(e) => updateContact(index, 'type', e.target.value as 'Phone' | 'Email')}
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
                                        sx={{ width: 100 }}
                                    />
                                    <IconButton size="small" onClick={() => removeContact(index)} color="error">
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            ))}
                        </Stack>
                    </Box>

                    {error && (
                        <Typography color="error" variant="body2">{error}</Typography>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Property Owner'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
