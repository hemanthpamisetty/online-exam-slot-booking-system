#!/usr/bin/env node
// ============================================
// test-all.js — Comprehensive API Test Suite
// for Online Exam Slot Booking System
//
// Usage: node test-all.js [BASE_URL]
// Default BASE_URL: http://localhost:3000
// ============================================

const http = require('http');
const https = require('https');

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const parsedBase = new URL(BASE_URL);
const isHttps = parsedBase.protocol === 'https:';

let sessionCookie = '';      // Student session
let adminSessionCookie = ''; // Admin session
let testSlotId = null;
let testBookingId = null;
let testHallTicket = null;
let testUserId = null;

const PASS = '✅ PASS';
const FAIL = '❌ FAIL';
let passCount = 0;
let failCount = 0;

// ============================================
// HTTP Helper
// ============================================
function request(method, path, body, cookie) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const data = body ? JSON.stringify(body) : null;

        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: method.toUpperCase(),
            headers: {
                'Content-Type': 'application/json',
                ...(cookie ? { 'Cookie': cookie } : {}),
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
            }
        };

        const transport = isHttps ? https : http;
        const req = transport.request(options, (res) => {
            let chunks = '';
            res.on('data', (chunk) => chunks += chunk);
            res.on('end', () => {
                // Capture set-cookie
                const setCookie = res.headers['set-cookie'];
                let newCookie = '';
                if (setCookie) {
                    newCookie = setCookie.map(c => c.split(';')[0]).join('; ');
                }

                let json = null;
                try { json = JSON.parse(chunks); } catch (e) { /* not JSON */ }
                resolve({ status: res.statusCode, body: json, raw: chunks, cookie: newCookie });
            });
        });

        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

// ============================================
// Test Runner
// ============================================
async function test(name, fn) {
    try {
        const result = await fn();
        if (result === false) {
            console.log(`  ${FAIL} ${name}`);
            failCount++;
        } else {
            console.log(`  ${PASS} ${name}`);
            passCount++;
        }
    } catch (err) {
        console.log(`  ${FAIL} ${name} — ${err.message}`);
        failCount++;
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
}

// ============================================
// Test Suites
// ============================================

async function testHealthCheck() {
    console.log('\n═══════════════════════════════════════');
    console.log('  🏥 Health Check');
    console.log('═══════════════════════════════════════');

    await test('GET /api/health returns healthy', async () => {
        const res = await request('GET', '/api/health');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body && res.body.status === 'healthy', 'Expected healthy status');
    });

    await test('GET /unknown returns 404', async () => {
        const res = await request('GET', '/api/unknown-route');
        assert(res.status === 404, `Expected 404, got ${res.status}`);
    });
}

async function testRegistration() {
    console.log('\n═══════════════════════════════════════');
    console.log('  📝 Registration Tests');
    console.log('═══════════════════════════════════════');

    await test('Register with empty body → 400', async () => {
        const res = await request('POST', '/api/auth/register', {});
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('Register with missing fields → 400', async () => {
        const res = await request('POST', '/api/auth/register', { name: 'Test' });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('Register with invalid email → 400', async () => {
        const res = await request('POST', '/api/auth/register', {
            name: 'Test', email: 'not-an-email', password: 'test123',
            phone: '1234567890', register_number: 'TST1234567'
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
        assert(res.body.message.includes('email'), 'Expected email error');
    });

    await test('Register with short password → 400', async () => {
        const res = await request('POST', '/api/auth/register', {
            name: 'Test', email: 'test@example.com', password: '123',
            phone: '1234567890', register_number: 'TST1234567'
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
        assert(res.body.message.includes('6 characters'), 'Expected password length error');
    });

    await test('Register with invalid register number → 400', async () => {
        const res = await request('POST', '/api/auth/register', {
            name: 'Test', email: 'test@example.com', password: 'test123',
            phone: '1234567890', register_number: 'SHORT'
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    const ts = Date.now();
    await test('Register with valid data → 200', async () => {
        const res = await request('POST', '/api/auth/register', {
            name: 'Test User', email: `testuser${ts}@example.com`, password: 'test123456',
            phone: '9876543210', register_number: `T${ts.toString().slice(-9)}`
        });
        assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
        assert(res.body.success === true, 'Expected success');
    });

    await test('Register duplicate email → 400', async () => {
        const res = await request('POST', '/api/auth/register', {
            name: 'Test User', email: `testuser${ts}@example.com`, password: 'test123456',
            phone: '9876543210', register_number: `D${ts.toString().slice(-9)}`
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
        assert(res.body.message.includes('already exists'), 'Expected duplicate error');
    });
}

async function testLogin() {
    console.log('\n═══════════════════════════════════════');
    console.log('  🔐 Login Tests');
    console.log('═══════════════════════════════════════');

    await test('Login with empty body → 400', async () => {
        const res = await request('POST', '/api/auth/login', {});
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('Login with wrong credentials → 400', async () => {
        const res = await request('POST', '/api/auth/login', {
            email: 'nonexistent@example.com', password: 'wrongpass'
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('Login as admin → 200 + session cookie', async () => {
        const res = await request('POST', '/api/auth/login', {
            email: 'admin@exam.com', password: 'admin123'
        });
        assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
        assert(res.body.success === true, 'Expected success');
        assert(res.body.user.role === 'admin', 'Expected admin role');
        if (res.cookie) adminSessionCookie = res.cookie;
    });

    await test('GET /api/auth/me with admin session → 200', async () => {
        const res = await request('GET', '/api/auth/me', null, adminSessionCookie);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.user && res.body.user.role === 'admin', 'Expected admin user');
    });

    await test('GET /api/auth/me without session → 401', async () => {
        const res = await request('GET', '/api/auth/me');
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });
}

async function testAdminSlotManagement() {
    console.log('\n═══════════════════════════════════════');
    console.log('  🛠️  Admin Slot Management');
    console.log('═══════════════════════════════════════');

    await test('Create slot without auth → 401', async () => {
        const res = await request('POST', '/api/admin/slots', { exam_name: 'Test' });
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test('Create slot with missing fields → 400', async () => {
        const res = await request('POST', '/api/admin/slots', { exam_name: 'Test' }, adminSessionCookie);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('Create slot with invalid capacity → 400', async () => {
        const res = await request('POST', '/api/admin/slots', {
            exam_name: 'Test', exam_date: '2026-12-01', start_time: '09:00',
            end_time: '12:00', venue: 'Hall A', capacity: -5
        }, adminSessionCookie);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('Create slot with end_time before start_time → 400', async () => {
        const res = await request('POST', '/api/admin/slots', {
            exam_name: 'Test', exam_date: '2026-12-01', start_time: '14:00',
            end_time: '10:00', venue: 'Hall A', capacity: 2
        }, adminSessionCookie);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('Create valid slot (capacity=2 for overbooking test) → 200', async () => {
        const res = await request('POST', '/api/admin/slots', {
            exam_name: 'Test Exam Slot', exam_date: '2026-12-15',
            start_time: '09:00', end_time: '12:00', venue: 'Test Hall', capacity: 2
        }, adminSessionCookie);
        assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
        assert(res.body.success === true, 'Expected success');
    });

    await test('GET /api/admin/stats → 200', async () => {
        const res = await request('GET', '/api/admin/stats', null, adminSessionCookie);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.stats, 'Expected stats object');
        assert(typeof res.body.stats.totalStudents === 'number', 'Expected totalStudents number');
    });
}

async function testAdminUserManagement() {
    console.log('\n═══════════════════════════════════════');
    console.log('  👤 Admin User Management');
    console.log('═══════════════════════════════════════');

    await test('GET /api/admin/users → 200', async () => {
        const res = await request('GET', '/api/admin/users', null, adminSessionCookie);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(Array.isArray(res.body.users), 'Expected users array');
        // Find an unverified test user to verify
        const unverified = res.body.users.find(u => u.role === 'student' && !u.is_verified);
        if (unverified) testUserId = unverified.id;
    });

    if (testUserId) {
        await test(`Verify user ${testUserId} → 200`, async () => {
            const res = await request('POST', `/api/admin/verify-user/${testUserId}`, {}, adminSessionCookie);
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test(`Verify same user again → 400 (already verified)`, async () => {
            const res = await request('POST', `/api/admin/verify-user/${testUserId}`, {}, adminSessionCookie);
            assert(res.status === 400, `Expected 400, got ${res.status}`);
        });
    }

    await test('Verify non-existent user → 404', async () => {
        const res = await request('POST', '/api/admin/verify-user/999999', {}, adminSessionCookie);
        assert(res.status === 404, `Expected 404, got ${res.status}`);
    });

    await test('Verify with invalid user ID → 400', async () => {
        const res = await request('POST', '/api/admin/verify-user/abc', {}, adminSessionCookie);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });
}

async function testSlotBooking() {
    console.log('\n═══════════════════════════════════════');
    console.log('  🎫 Slot Booking Tests');
    console.log('═══════════════════════════════════════');

    // First, create a verified student and log in
    const ts = Date.now();
    const studentEmail = `student${ts}@example.com`;
    const studentRegNum = `S${ts.toString().slice(-9)}`;

    // Register + Admin verify
    await request('POST', '/api/auth/register', {
        name: 'Booking Student', email: studentEmail, password: 'booking123',
        phone: '1111111111', register_number: studentRegNum
    });

    // Get user id and verify via admin
    const usersRes = await request('GET', '/api/admin/users', null, adminSessionCookie);
    const newStudent = usersRes.body.users.find(u => u.email === studentEmail);
    if (newStudent) {
        await request('POST', `/api/admin/verify-user/${newStudent.id}`, {}, adminSessionCookie);
    }

    // Login as student
    const loginRes = await request('POST', '/api/auth/login', {
        email: studentEmail, password: 'booking123'
    });
    if (loginRes.cookie) sessionCookie = loginRes.cookie;

    await test('Student login → 200', async () => {
        assert(loginRes.status === 200, `Expected 200, got ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
        assert(sessionCookie, 'Expected session cookie');
    });

    // Get available slots
    await test('GET /api/slots → 200 (list available)', async () => {
        const res = await request('GET', '/api/slots', null, sessionCookie);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(Array.isArray(res.body.slots), 'Expected slots array');
        // Find the test slot
        const slot = res.body.slots.find(s => s.exam_name === 'Test Exam Slot');
        if (slot) testSlotId = slot.id;
    });

    await test('Book slot without auth → 401', async () => {
        const res = await request('POST', '/api/slots/book', { slotId: testSlotId });
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test('Book with no slotId → 400', async () => {
        const res = await request('POST', '/api/slots/book', {}, sessionCookie);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('Book with invalid slotId → 400', async () => {
        const res = await request('POST', '/api/slots/book', { slotId: 'abc' }, sessionCookie);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('Book non-existent slot → 400', async () => {
        const res = await request('POST', '/api/slots/book', { slotId: 999999 }, sessionCookie);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    if (testSlotId) {
        await test('Book valid slot → 200', async () => {
            const res = await request('POST', '/api/slots/book', { slotId: testSlotId }, sessionCookie);
            assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
            assert(res.body.hallTicketNo, 'Expected hallTicketNo');
            testHallTicket = res.body.hallTicketNo;
        });

        await test('Duplicate booking same slot → 400', async () => {
            const res = await request('POST', '/api/slots/book', { slotId: testSlotId }, sessionCookie);
            assert(res.status === 400, `Expected 400, got ${res.status}`);
            assert(res.body.message.includes('already booked'), 'Expected duplicate error');
        });

        await test('GET /api/slots/my-bookings → 200', async () => {
            const res = await request('GET', '/api/slots/my-bookings', null, sessionCookie);
            assert(res.status === 200, `Expected 200, got ${res.status}`);
            assert(res.body.bookings.length > 0, 'Expected at least one booking');
            testBookingId = res.body.bookings.find(b => b.status === 'confirmed')?.id;
        });
    }
}

async function testSlotCapacity() {
    console.log('\n═══════════════════════════════════════');
    console.log('  🔒 Slot Capacity / Overbooking Test');
    console.log('═══════════════════════════════════════');

    if (!testSlotId) {
        console.log('  ⚠️  Skipped (no test slot available)');
        return;
    }

    // The test slot has capacity=2. Student #1 already booked 1.
    // Create a second student and book, then try a third to test capacity.
    const ts = Date.now();
    const student2Email = `cap2-${ts}@example.com`;
    const student2Reg = `C${ts.toString().slice(-9)}`;

    await request('POST', '/api/auth/register', {
        name: 'Cap Student 2', email: student2Email, password: 'cap123456',
        phone: '2222222222', register_number: student2Reg
    });

    // Admin verify
    const usersRes = await request('GET', '/api/admin/users', null, adminSessionCookie);
    const s2 = usersRes.body.users.find(u => u.email === student2Email);
    if (s2) await request('POST', `/api/admin/verify-user/${s2.id}`, {}, adminSessionCookie);

    const login2 = await request('POST', '/api/auth/login', { email: student2Email, password: 'cap123456' });
    const cookie2 = login2.cookie;

    await test('Student 2 books same slot (seat 2 of 2) → 200', async () => {
        const res = await request('POST', '/api/slots/book', { slotId: testSlotId }, cookie2);
        assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    });

    // Now create a third student and try to book — should be full
    const student3Email = `cap3-${ts}@example.com`;
    const student3Reg = `D${ts.toString().slice(-9)}`;

    await request('POST', '/api/auth/register', {
        name: 'Cap Student 3', email: student3Email, password: 'cap123456',
        phone: '3333333333', register_number: student3Reg
    });
    const usersRes3 = await request('GET', '/api/admin/users', null, adminSessionCookie);
    const s3 = usersRes3.body.users.find(u => u.email === student3Email);
    if (s3) await request('POST', `/api/admin/verify-user/${s3.id}`, {}, adminSessionCookie);

    const login3 = await request('POST', '/api/auth/login', { email: student3Email, password: 'cap123456' });
    const cookie3 = login3.cookie;

    await test('Student 3 books full slot → 400 (slot full)', async () => {
        const res = await request('POST', '/api/slots/book', { slotId: testSlotId }, cookie3);
        assert(res.status === 400, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
        assert(res.body.message.includes('full') || res.body.message.includes('unavailable'), 'Expected full slot message');
    });
}

async function testCancellation() {
    console.log('\n═══════════════════════════════════════');
    console.log('  🗑️  Cancellation Tests');
    console.log('═══════════════════════════════════════');

    await test('Cancel without auth → 401', async () => {
        const res = await request('DELETE', '/api/slots/cancel/1');
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test('Cancel with invalid ID → 400', async () => {
        const res = await request('DELETE', '/api/slots/cancel/abc', null, sessionCookie);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('Cancel non-existent booking → 404', async () => {
        const res = await request('DELETE', '/api/slots/cancel/999999', null, sessionCookie);
        assert(res.status === 404, `Expected 404, got ${res.status}`);
    });

    if (testBookingId) {
        await test(`Cancel booking ${testBookingId} → 200`, async () => {
            const res = await request('DELETE', `/api/slots/cancel/${testBookingId}`, null, sessionCookie);
            assert(res.status === 200, `Expected 200, got ${res.status}`);
        });

        await test('Cancel same booking again → 404 (already cancelled)', async () => {
            const res = await request('DELETE', `/api/slots/cancel/${testBookingId}`, null, sessionCookie);
            assert(res.status === 404, `Expected 404, got ${res.status}`);
        });
    }
}

async function testForgotPassword() {
    console.log('\n═══════════════════════════════════════');
    console.log('  🔑 Forgot / Reset Password Tests');
    console.log('═══════════════════════════════════════');

    await test('Forgot password with no email → 400', async () => {
        const res = await request('POST', '/api/auth/forgot-password', {});
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('Forgot password with non-existent email → 200 (no leak)', async () => {
        const res = await request('POST', '/api/auth/forgot-password', { email: 'nope@nope.com' });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.success === true, 'Expected success (no information leak)');
    });

    await test('Reset password with missing fields → 400', async () => {
        const res = await request('POST', '/api/auth/reset-password', { email: 'x@x.com' });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('Reset password with short password → 400', async () => {
        const res = await request('POST', '/api/auth/reset-password', {
            email: 'x@x.com', otp: '123456', newPassword: '12'
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('Reset password with invalid OTP → 400', async () => {
        const res = await request('POST', '/api/auth/reset-password', {
            email: 'admin@exam.com', otp: '000000', newPassword: 'newpass123'
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });
}

async function testAdminBookings() {
    console.log('\n═══════════════════════════════════════');
    console.log('  📋 Admin Bookings View');
    console.log('═══════════════════════════════════════');

    await test('GET /api/admin/bookings without auth → 401', async () => {
        const res = await request('GET', '/api/admin/bookings');
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test('GET /api/admin/bookings as admin → 200', async () => {
        const res = await request('GET', '/api/admin/bookings', null, adminSessionCookie);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(Array.isArray(res.body.bookings), 'Expected bookings array');
    });
}

async function testSlotDeletion() {
    console.log('\n═══════════════════════════════════════');
    console.log('  🗑️  Admin Slot Deletion');
    console.log('═══════════════════════════════════════');

    // The test slot still has active bookings (student 2), so delete should fail
    if (testSlotId) {
        await test('Delete slot with active bookings → 400', async () => {
            const res = await request('DELETE', `/api/admin/slots/${testSlotId}`, null, adminSessionCookie);
            assert(res.status === 400, `Expected 400, got ${res.status}`);
        });
    }

    await test('Delete non-existent slot → 404', async () => {
        const res = await request('DELETE', '/api/admin/slots/999999', null, adminSessionCookie);
        assert(res.status === 404, `Expected 404, got ${res.status}`);
    });

    await test('Delete slot with invalid ID → 400', async () => {
        const res = await request('DELETE', '/api/admin/slots/abc', null, adminSessionCookie);
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });
}

async function testLogout() {
    console.log('\n═══════════════════════════════════════');
    console.log('  🚪 Logout Test');
    console.log('═══════════════════════════════════════');

    await test('POST /api/auth/logout → 200', async () => {
        const res = await request('POST', '/api/auth/logout', {}, sessionCookie);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    await test('GET /api/auth/me after logout → 401', async () => {
        const res = await request('GET', '/api/auth/me', null, sessionCookie);
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });
}

// ============================================
// Main
// ============================================
async function main() {
    console.log('╔═══════════════════════════════════════╗');
    console.log('║  Exam Slot Booking — API Test Suite   ║');
    console.log('╚═══════════════════════════════════════╝');
    console.log(`  Target: ${BASE_URL}`);
    console.log(`  Time:   ${new Date().toISOString()}`);

    try {
        await testHealthCheck();
        await testRegistration();
        await testLogin();
        await testAdminSlotManagement();
        await testAdminUserManagement();
        await testSlotBooking();
        await testSlotCapacity();
        await testCancellation();
        await testForgotPassword();
        await testAdminBookings();
        await testSlotDeletion();
        await testLogout();
    } catch (err) {
        console.error('\n💥 UNHANDLED TEST ERROR:', err);
    }

    console.log('\n═══════════════════════════════════════');
    console.log('  📊 RESULTS');
    console.log('═══════════════════════════════════════');
    console.log(`  ✅ Passed: ${passCount}`);
    console.log(`  ❌ Failed: ${failCount}`);
    console.log(`  📝 Total:  ${passCount + failCount}`);
    console.log('═══════════════════════════════════════\n');

    process.exit(failCount > 0 ? 1 : 0);
}

main();
