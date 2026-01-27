const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireManager } = require('../middleware/auth');

const router = express.Router();

// Helper to validate YYYY-MM-DD date strings
function isValidDateParam(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const match = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
    if (!match) return false;
    const date = new Date(dateStr);
    // Check that the date object matches the original string (to avoid 2024-02-30 becoming March 1st, etc.)
    const iso = date.toISOString().split('T')[0];
    return iso === dateStr;
}

// Daily summary report for managers about their team
router.get('/daily-summary', authenticateToken, requireManager, async (req, res) => {
    try {
        const { date, employee_id } = req.query;

        if (!isValidDateParam(date)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or missing date. Expected format: YYYY-MM-DD'
            });
        }

        const managerId = req.user.id;

        // Per-employee breakdown: check-ins, unique clients, and total working minutes
        let perEmployeeQuery = `
            SELECT 
                u.id AS employee_id,
                u.name AS employee_name,
                COUNT(ch.id) AS total_checkins,
                COUNT(DISTINCT ch.client_id) AS unique_clients,
                SUM(
                    CASE 
                        WHEN ch.checkout_time IS NOT NULL 
                        THEN TIMESTAMPDIFF(MINUTE, ch.checkin_time, ch.checkout_time)
                        ELSE 0
                    END
                ) AS total_minutes
            FROM users u
            LEFT JOIN checkins ch 
                ON ch.employee_id = u.id
                AND DATE(ch.checkin_time) = ?
            WHERE u.manager_id = ?
        `;
        const perEmployeeParams = [date, managerId];

        if (employee_id) {
            perEmployeeQuery += ' AND u.id = ?';
            perEmployeeParams.push(employee_id);
        }

        perEmployeeQuery += ' GROUP BY u.id, u.name ORDER BY u.name ASC';

        const [perEmployeeRows] = await pool.execute(perEmployeeQuery, perEmployeeParams);

        // Team-level aggregate statistics for the same date and optional employee filter
        let teamQuery = `
            SELECT 
                COUNT(DISTINCT u.id) AS team_members,
                COUNT(ch.id) AS total_checkins,
                COUNT(DISTINCT ch.client_id) AS unique_clients,
                SUM(
                    CASE 
                        WHEN ch.checkout_time IS NOT NULL 
                        THEN TIMESTAMPDIFF(MINUTE, ch.checkin_time, ch.checkout_time)
                        ELSE 0
                    END
                ) AS total_minutes
            FROM users u
            LEFT JOIN checkins ch 
                ON ch.employee_id = u.id
                AND DATE(ch.checkin_time) = ?
            WHERE u.manager_id = ?
        `;
        const teamParams = [date, managerId];

        if (employee_id) {
            teamQuery += ' AND u.id = ?';
            teamParams.push(employee_id);
        }

        const [teamRows] = await pool.execute(teamQuery, teamParams);
        const teamRow = teamRows[0] || {
            team_members: 0,
            total_checkins: 0,
            unique_clients: 0,
            total_minutes: 0
        };

        // Convert minutes to hours with two decimal places in the response
        const employees = perEmployeeRows.map((row) => ({
            employee_id: row.employee_id,
            employee_name: row.employee_name,
            total_checkins: Number(row.total_checkins) || 0,
            unique_clients: Number(row.unique_clients) || 0,
            total_hours: row.total_minutes != null ? Number((row.total_minutes / 60).toFixed(2)) : 0
        }));

        const team = {
            team_members: Number(teamRow.team_members) || 0,
            total_checkins: Number(teamRow.total_checkins) || 0,
            unique_clients: Number(teamRow.unique_clients) || 0,
            total_hours: teamRow.total_minutes != null ? Number((teamRow.total_minutes / 60).toFixed(2)) : 0
        };

        res.json({
            success: true,
            data: {
                date,
                employee_id: employee_id ? Number(employee_id) : null,
                team,
                employees
            }
        });
    } catch (error) {
        console.error('Daily summary report error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch daily summary report' });
    }
});

module.exports = router;

