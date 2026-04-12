// ============================================
// Book Slot Page JavaScript
// Handles: View available slots and book
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
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
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
// Check auth
// ============================================
async function checkAuth() {
    try {
        const res = await fetch(`${API}/api/auth/me`);
        const data = await res.json();
        if (!data.success) {
            window.location.href = 'index.html';
            return;
        }
        if (data.user.role === 'admin') {
            window.location.href = 'admin.html';
            return;
        }
        loadSlots();
    } catch (err) {
        window.location.href = 'index.html';
    }
}

// ============================================
// Load available slots
// ============================================
async function loadSlots() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${API}/api/slots`, { signal: controller.signal });
        
        clearTimeout(timeoutId);
        const data = await res.json();

        const container = document.getElementById('slotsContainer');
        const emptyState = document.getElementById('emptyState');

        if (!data.success || data.slots.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        let html = '';
        data.slots.forEach(slot => {
            const available = slot.capacity - slot.booked;
            const isFull = available <= 0;
            const percentage = Math.round((slot.booked / slot.capacity) * 100);

            html += `
            <div class="slot-card">
                <div class="slot-header">
                    <h3>${slot.exam_name}</h3>
                    <div class="date">📅 ${formatDate(slot.exam_date)}</div>
                </div>
                <div class="slot-body">
                    <div class="slot-detail">
                        <span class="icon">🕐</span>
                        <span>${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}</span>
                    </div>
                    <div class="slot-detail">
                        <span class="icon">📍</span>
                        <span>${slot.venue}</span>
                    </div>
                    <div class="slot-detail">
                        <span class="icon">👥</span>
                        <span>${slot.booked} / ${slot.capacity} booked (${percentage}%)</span>
                    </div>
                    <!-- Capacity bar -->
                    <div style="background: #e2e8f0; border-radius: 50px; height: 6px; margin-top: 0.5rem; overflow: hidden;">
                        <div style="background: ${isFull ? '#ef4444' : '#10b981'}; height: 100%; width: ${percentage}%; border-radius: 50px; transition: width 0.3s ease;"></div>
                    </div>
                </div>
                <div class="slot-footer">
                    <span class="availability ${isFull ? 'full' : 'available'}">
                        ${isFull ? '❌ Full' : `✅ ${available} seats left`}
                    </span>
                    ${isFull
                        ? '<button class="btn btn-sm btn-danger" disabled>Fully Booked</button>'
                        : `<button class="btn btn-sm btn-success" onclick="bookSlot(${slot.id})">Book Now</button>`
                    }
                </div>
            </div>`;
        });

        container.innerHTML = html;

    } catch (err) {
        showAlert('Error loading slots');
    }
}

// ============================================
// Book a slot
// ============================================
async function bookSlot(slotId) {
    if (!confirm('Are you sure you want to book this slot?')) return;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`${API}/api/slots/book`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slotId }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success) {
            showAlert(`Slot booked! Hall Ticket: ${data.hallTicketNo}`, 'success');
            loadSlots();  // Refresh slot list
        } else {
            showAlert(data.message);
        }
    } catch (err) {
        showAlert('Error booking slot');
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
