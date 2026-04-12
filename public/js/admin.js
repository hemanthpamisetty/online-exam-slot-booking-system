// ============================================
// Admin Dashboard JavaScript
// Handles: Stats, Users, Bookings, Slots, Logs, Add Slot
// ============================================

const API = '';
const alertBox = document.getElementById('alertBox');

// ============================================
// Show alert
// ============================================
function showAlert(message, type = 'error') {
    alertBox.className = `alert alert-${type} show`;
    alertBox.textContent = message;
    setTimeout(() => { alertBox.classList.remove('show'); }, 5000);
}

// ============================================
// Format helpers
// ============================================
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}

function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatTime(timeStr) {
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m} ${ampm}`;
}

// ============================================
// Check auth (admin only)
// ============================================
async function checkAuth() {
    try {
        const res = await fetch(`${API}/api/auth/me`);
        const data = await res.json();

        if (!data.success) {
            window.location.href = 'index.html';
            return;
        }

        if (data.user.role !== 'admin') {
            window.location.href = 'dashboard.html';
            return;
        }

        // Load all data
        loadStats();
        loadUsers();
        loadBookings();
        loadSlots();
        loadLogs();

    } catch (err) {
        window.location.href = 'index.html';
    }
}

// ============================================
// Load dashboard stats
// ============================================
async function loadStats() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${API}/api/admin/stats`, { signal: controller.signal });
        
        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success) {
            document.getElementById('statStudents').textContent = data.stats.totalStudents;
            document.getElementById('statBookings').textContent = data.stats.activeBookings;
            document.getElementById('statSlots').textContent = data.stats.totalSlots;
            document.getElementById('statCancelled').textContent = data.stats.cancelledBookings;
        }
    } catch (err) {
        console.error('Error loading stats');
    }
}

// ============================================
// Load users table
// ============================================
async function loadUsers() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${API}/api/admin/users`, { signal: controller.signal });
        
        clearTimeout(timeoutId);
        const data = await res.json();

        const tbody = document.getElementById('usersTableBody');

        if (!data.success || data.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No users found</td></tr>';
            return;
        }

        let html = '';
        data.users.forEach(u => {
            const roleBadge = `<span class="badge badge-${u.role}">${u.role}</span>`;
            const verified = u.is_verified ? '✅ Yes' : '❌ No';

            html += `
                <tr>
                    <td>${u.id}</td>
                    <td><strong>${u.name}</strong></td>
                    <td>${u.email}</td>
                    <td>${u.phone}</td>
                    <td>${roleBadge}</td>
                    <td>${verified}</td>
                    <td>${formatDateTime(u.created_at)}</td>
                </tr>`;
        });

        tbody.innerHTML = html;

    } catch (err) {
        console.error('Error loading users');
    }
}

// ============================================
// Load bookings table
// ============================================
async function loadBookings() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${API}/api/admin/bookings`, { signal: controller.signal });
        
        clearTimeout(timeoutId);
        const data = await res.json();

        const tbody = document.getElementById('bookingsTableBody');

        if (!data.success || data.bookings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No bookings found</td></tr>';
            return;
        }

        let html = '';
        data.bookings.forEach(b => {
            const statusBadge = `<span class="badge badge-${b.status}">${b.status}</span>`;

            html += `
                <tr>
                    <td>${b.id}</td>
                    <td><strong>${b.student_name}</strong><br><span style="font-size:0.78rem; color:var(--text-light);">${b.student_email}</span></td>
                    <td>${b.exam_name}</td>
                    <td>${formatDate(b.exam_date)}</td>
                    <td>${formatTime(b.start_time)} - ${formatTime(b.end_time)}</td>
                    <td>${b.venue}</td>
                    <td><code>${b.hall_ticket_no || '—'}</code></td>
                    <td>${statusBadge}</td>
                </tr>`;
        });

        tbody.innerHTML = html;

    } catch (err) {
        console.error('Error loading bookings');
    }
}

// ============================================
// Load slots table
// ============================================
async function loadSlots() {
    try {
        const res = await fetch(`${API}/api/admin/slots`);
        const data = await res.json();

        const tbody = document.getElementById('slotsTableBody');

        if (!data.success || data.slots.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No slots found</td></tr>';
            return;
        }

        let html = '';
        data.slots.forEach(s => {
            const available = s.capacity - s.booked;

            html += `
                <tr>
                    <td>${s.id}</td>
                    <td><strong>${s.exam_name}</strong></td>
                    <td>${formatDate(s.exam_date)}</td>
                    <td>${formatTime(s.start_time)} - ${formatTime(s.end_time)}</td>
                    <td>${s.venue}</td>
                    <td>${s.capacity}</td>
                    <td>${s.booked}</td>
                    <td><span class="availability ${available <= 0 ? 'full' : 'available'}">${available}</span></td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="deleteSlot(${s.id})" title="Delete slot">🗑️</button>
                    </td>
                </tr>`;
        });

        tbody.innerHTML = html;

    } catch (err) {
        console.error('Error loading slots');
    }
}

// ============================================
// Load login logs table
// ============================================
async function loadLogs() {
    try {
        const res = await fetch(`${API}/api/admin/logs`);
        const data = await res.json();

        const tbody = document.getElementById('logsTableBody');

        if (!data.success || data.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No login logs found</td></tr>';
            return;
        }

        let html = '';
        data.logs.forEach(l => {
            html += `
                <tr>
                    <td>${l.id}</td>
                    <td><strong>${l.user_name}</strong></td>
                    <td>${l.email}</td>
                    <td>${formatDateTime(l.login_time)}</td>
                    <td><code>${l.ip_address || 'N/A'}</code></td>
                </tr>`;
        });

        tbody.innerHTML = html;

    } catch (err) {
        console.error('Error loading logs');
    }
}

// ============================================
// Delete a slot
// ============================================
async function deleteSlot(slotId) {
    if (!confirm('Are you sure you want to delete this slot?')) return;

    try {
        const res = await fetch(`${API}/api/admin/slots/${slotId}`, {
            method: 'DELETE'
        });

        const data = await res.json();

        if (data.success) {
            showAlert('Slot deleted successfully', 'success');
            loadSlots();
            loadStats();
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        showAlert('Error deleting slot');
    }
}

// ============================================
// Add new slot form handler
// ============================================
document.getElementById('addSlotForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const exam_name = document.getElementById('examName').value.trim();
    const exam_date = document.getElementById('examDate').value;
    const start_time = document.getElementById('startTime').value;
    const end_time = document.getElementById('endTime').value;
    const venue = document.getElementById('venue').value.trim();
    const capacity = document.getElementById('capacity').value;

    if (!exam_name || !exam_date || !start_time || !end_time || !venue || !capacity) {
        return showAlert('Please fill in all fields');
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${API}/api/admin/slots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exam_name, exam_date, start_time, end_time, venue, capacity }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success) {
            showAlert('Exam slot created successfully!', 'success');
            document.getElementById('addSlotForm').reset();
            loadSlots();
            loadStats();
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        showAlert('Error creating slot');
    }
});

// ============================================
// Tab switching
// ============================================
function switchTab(tabName) {
    // Deactivate all tabs and content
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Activate selected tab and content
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // Find and activate the matching button
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        if (btn.textContent.toLowerCase().includes(tabName.toLowerCase().replace('addslot', 'add slot'))) {
            btn.classList.add('active');
        }
    });

    // Fix: better tab matching
    const tabMap = {
        'users': 0,
        'bookings': 1,
        'slots': 2,
        'logs': 3,
        'addSlot': 4
    };

    buttons.forEach(b => b.classList.remove('active'));
    if (tabMap[tabName] !== undefined) {
        buttons[tabMap[tabName]].classList.add('active');
    }
}

// ============================================
// Logout
// ============================================
async function logout() {
    try {
        await fetch(`${API}/api/auth/logout`, { method: 'POST' });
    } catch (err) { /* ignore */ }
    window.location.href = 'index.html';
}

// Initialize
checkAuth();
