const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

function makeToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('GET /api/reports/daily-summary', () => {
    it('returns 401 when no token is provided', async () => {
        const res = await request(app).get('/api/reports/daily-summary');

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it('returns 400 for missing or invalid date', async () => {
        const managerToken = makeToken({
            id: 1,
            email: 'manager@unolo.com',
            role: 'manager',
            name: 'Amit Sharma'
        });

        const res = await request(app)
            .get('/api/reports/daily-summary')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/date/i);
    });

    it('returns 403 when a non-manager hits the endpoint', async () => {
        const employeeToken = makeToken({
            id: 2,
            email: 'rahul@unolo.com',
            role: 'employee',
            name: 'Rahul Kumar'
        });

        const res = await request(app)
            .get('/api/reports/daily-summary')
            .set('Authorization', `Bearer ${employeeToken}`)
            .query({ date: '2024-01-15' });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/manager/i);
    });

    it('returns daily summary data for a manager with valid date', async () => {
        const managerToken = makeToken({
            id: 1,
            email: 'manager@unolo.com',
            role: 'manager',
            name: 'Amit Sharma'
        });

        const res = await request(app)
            .get('/api/reports/daily-summary')
            .set('Authorization', `Bearer ${managerToken}`)
            .query({ date: '2024-01-15' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const data = res.body.data;
        expect(data).toBeDefined();
        expect(data.date).toBe('2024-01-15');
        expect(data.team).toBeDefined();
        expect(Array.isArray(data.employees)).toBe(true);
    });
});

