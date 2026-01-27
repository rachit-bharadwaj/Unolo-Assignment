const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

//  helper to calculate distance between employee and client locations in kilometers (Haversine formula)
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    if (
        lat1 == null || lon1 == null ||
        lat2 == null || lon2 == null
    ) {
        return null;
    }

    const toRad = (value) => (value * Math.PI) / 180;

    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;

    return d;
}

// Get assigned clients for employee
router.get('/clients', authenticateToken, async (req, res) => {
    try {
        const [clients] = await pool.execute(
            `SELECT c.* FROM clients c
             INNER JOIN employee_clients ec ON c.id = ec.client_id
             WHERE ec.employee_id = ?`,
            [req.user.id]
        );

        res.json({ success: true, data: clients });
    } catch (error) {
        console.error('Get clients error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch clients' });
    }
});

// Create new check-in
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { client_id, latitude, longitude, notes } = req.body;

        // Basic input validation with clear messages
        if (client_id === undefined || client_id === null || client_id === '') {
            return res.status(400).json({ success: false, message: 'client_id is required' });
        }

        const clientIdNumber = Number(client_id);
        if (!Number.isInteger(clientIdNumber) || clientIdNumber <= 0) {
            return res.status(400).json({ success: false, message: 'client_id must be a valid positive integer' });
        }

        if (latitude == null || longitude == null) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required to create a check-in'
            });
        }

        const latNumber = Number(latitude);
        const lonNumber = Number(longitude);

        if (Number.isNaN(latNumber) || Number.isNaN(lonNumber)) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude must be valid numeric values'
            });
        }

        // Check if employee is assigned to this client
        const [assignments] = await pool.execute(
            'SELECT * FROM employee_clients WHERE employee_id = ? AND client_id = ?',
            [req.user.id, clientIdNumber]
        );

        if (assignments.length === 0) {
            return res.status(403).json({ success: false, message: 'You are not assigned to this client' });
        }

        // Check for existing active check-in
        const [activeCheckins] = await pool.execute(
            'SELECT * FROM checkins WHERE employee_id = ? AND status = "checked_in"',
            [req.user.id]
        );

        if (activeCheckins.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'You already have an active check-in. Please checkout first.' 
            });
        }

        //  fetch client location to calculate distance between employee and client
        const [clientRows] = await pool.execute(
            'SELECT latitude, longitude FROM clients WHERE id = ?',
            [clientIdNumber]
        );

        if (clientRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Client not found'
            });
        }

        const client = clientRows[0];

        //  compute distance in km between current device location and client location
        const distanceKm = calculateDistanceKm(
            latNumber,
            lonNumber,
            Number(client?.latitude),
            Number(client?.longitude)
        );

        const [result] = await pool.execute(
            //  persist computed distance in distance_from_client column for reporting
            `INSERT INTO checkins (employee_id, client_id, latitude, longitude, distance_from_client, notes, status)
             VALUES (?, ?, ?, ?, ?, ?, 'checked_in')`,
            [req.user.id, clientIdNumber, latNumber, lonNumber, distanceKm, notes || null]
        );

        res.status(201).json({
            success: true,
                data: {
                id: result.insertId,
                message: 'Checked in successfully',
                //  expose distance so UI can show confirmation with distance value
                distance_from_client: distanceKm
            }
        });
    } catch (error) {
        console.error('Check-in error:', error);
        res.status(500).json({ success: false, message: 'Check-in failed' });
    }
});

// Checkout from current location
router.put('/checkout', authenticateToken, async (req, res) => {
    try {
        const [activeCheckins] = await pool.execute(
            'SELECT * FROM checkins WHERE employee_id = ? ORDER BY checkin_time DESC LIMIT 1',
            [req.user.id]
        );

        if (activeCheckins.length === 0) {
            return res.status(404).json({ success: false, message: 'No active check-in found' });
        }

        await pool.execute(
            "UPDATE checkins SET checkout_time = datetime('now'), status = 'checked_out' WHERE id = ?",
            [activeCheckins[0].id]
        );

        res.json({ success: true, message: 'Checked out successfully' });
    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ success: false, message: 'Checkout failed' });
    }
});

// Helper to validate optional date strings in YYYY-MM-DD format
function isValidDateFilter(dateStr) {
    if (!dateStr) return true; // allow empty
    if (typeof dateStr !== 'string') return false;
    const match = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
    if (!match) return false;
    const date = new Date(dateStr);
    const iso = date.toISOString().split('T')[0];
    return iso === dateStr;
}

// Get check-in history
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        if (!isValidDateFilter(start_date) || !isValidDateFilter(end_date)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date filter. start_date and end_date must use YYYY-MM-DD format'
            });
        }
        
        let query = `
            SELECT ch.*, c.name as client_name, c.address as client_address
            FROM checkins ch
            INNER JOIN clients c ON ch.client_id = c.id
            WHERE ch.employee_id = ?
        `;
        const params = [req.user.id];

        if (start_date) {
            query += ' AND DATE(ch.checkin_time) >= ?';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND DATE(ch.checkin_time) <= ?';
            params.push(end_date);
        }

        query += ' ORDER BY ch.checkin_time DESC';

        const [checkins] = await pool.execute(query, params);

        res.json({ success: true, data: checkins });
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch history' });
    }
});

// Get current active check-in
router.get('/active', authenticateToken, async (req, res) => {
    try {
        const [checkins] = await pool.execute(
            `SELECT ch.*, c.name as client_name 
             FROM checkins ch
             INNER JOIN clients c ON ch.client_id = c.id
             WHERE ch.employee_id = ? AND ch.status = 'checked_in'
             ORDER BY ch.checkin_time DESC LIMIT 1`,
            [req.user.id]
        );

        res.json({ 
            success: true, 
            data: checkins.length > 0 ? checkins[0] : null 
        });
    } catch (error) {
        console.error('Active checkin error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch active check-in' });
    }
});

module.exports = router;
