// ============================================
// Reusable Navbar Component
// Dynamically injects navbar into all pages
// Handles: User info, profile dropdown, logout
// ============================================

(function () {
    'use strict';

    const API = '';

    // ============================================
    // Configuration: Define nav links for each role
    // ============================================
    const NAV_LINKS = {
        student: [
            { label: 'Dashboard', href: 'dashboard.html', icon: '📊' },
            { label: 'Book Slot', href: 'book-slot.html', icon: '📅' },
        ],
        admin: [
            { label: 'Admin Panel', href: 'admin.html', icon: '🛡️' },
        ]
    };

    // ============================================
    // Detect current page for active highlighting
    // ============================================
    function getCurrentPage() {
        const path = window.location.pathname;
        const page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
        return page.toLowerCase();
    }

    // ============================================
    // Get user initials for default avatar
    // ============================================
    function getInitials(name) {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return parts[0][0].toUpperCase();
    }

    // ============================================
    // Build the navbar HTML
    // ============================================
    function buildNavbar(user) {
        const currentPage = getCurrentPage();
        const role = user.role || 'student';
        const links = NAV_LINKS[role] || NAV_LINKS.student;
        const initials = getInitials(user.name);

        // Build nav links with active state
        const linksHTML = links.map(link => {
            const isActive = currentPage === link.href.toLowerCase();
            return `
                <li>
                    <a href="${link.href}" class="${isActive ? 'nav-active' : ''}">
                        <span class="nav-link-icon">${link.icon}</span>
                        ${link.label}
                    </a>
                </li>`;
        }).join('');

        return `
        <nav class="navbar-premium" id="navbarPremium">
            <!-- Brand / Logo -->
            <a class="nav-brand" href="${role === 'admin' ? 'admin.html' : 'dashboard.html'}">
                <div class="nav-brand-icon">🎓</div>
                <div class="nav-brand-text"><span>Exam</span> Slot Booking</div>
            </a>

            <!-- Center Navigation Links -->
            <ul class="nav-center" id="navCenterLinks">
                ${linksHTML}
            </ul>

            <!-- Right Side: Profile + Hamburger -->
            <div class="nav-right">
                <!-- Profile Dropdown -->
                <div class="nav-profile" id="navProfile">
                    <button class="nav-profile-btn" id="navProfileBtn" aria-label="User profile menu">
                        <div class="nav-avatar" style="position:relative;">
                            ${initials}
                            <div class="nav-status-dot"></div>
                        </div>
                        <span class="nav-username" id="navUsername">${user.name || 'User'}</span>
                        <span class="nav-dropdown-arrow">▼</span>
                    </button>

                    <!-- Dropdown Menu -->
                    <div class="nav-dropdown" id="navDropdown">
                        <div class="nav-dropdown-header">
                            <div class="dd-name">${user.name || 'User'}</div>
                            <div class="dd-email">${user.email || ''}</div>
                            <span class="dd-role">${role}</span>
                        </div>
                        <div class="nav-dropdown-items">
                            <a href="${role === 'admin' ? 'admin.html' : 'dashboard.html'}" class="nav-dropdown-item">
                                <span class="dd-icon">🏠</span>
                                Dashboard
                            </a>
                            ${role !== 'admin' ? `
                            <a href="book-slot.html" class="nav-dropdown-item">
                                <span class="dd-icon">📅</span>
                                Book Slot
                            </a>` : ''}
                            <div class="nav-dropdown-divider"></div>
                            <button class="nav-dropdown-item logout-item" id="navLogoutBtn">
                                <span class="dd-icon">🚪</span>
                                Logout
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Hamburger (mobile) -->
                <button class="nav-hamburger" id="navHamburger" aria-label="Toggle menu">
                    <div class="nav-hamburger-lines">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </button>
            </div>
        </nav>`;
    }

    // ============================================
    // Inject navbar into the page
    // ============================================
    function injectNavbar(user) {
        // Remove any existing old navbar
        const oldNav = document.querySelector('nav.navbar');
        if (oldNav) {
            oldNav.remove();
        }

        // Insert navbar at top of body
        document.body.insertAdjacentHTML('afterbegin', buildNavbar(user));
        document.body.classList.add('has-navbar');

        // Attach event listeners
        attachEvents();
    }

    // ============================================
    // Attach event listeners
    // ============================================
    function attachEvents() {
        // Profile dropdown toggle
        const profileBtn = document.getElementById('navProfileBtn');
        const profileContainer = document.getElementById('navProfile');

        if (profileBtn) {
            profileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                profileContainer.classList.toggle('open');
            });
        }

        // Close dropdown on outside click
        document.addEventListener('click', (e) => {
            if (profileContainer && !profileContainer.contains(e.target)) {
                profileContainer.classList.remove('open');
            }
        });

        // Close dropdown on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                profileContainer.classList.remove('open');
            }
        });

        // Hamburger menu toggle (mobile)
        const hamburger = document.getElementById('navHamburger');
        const navCenter = document.getElementById('navCenterLinks');

        if (hamburger) {
            hamburger.addEventListener('click', () => {
                hamburger.classList.toggle('open');
                navCenter.classList.toggle('mobile-open');
            });
        }

        // Close mobile menu on link click
        if (navCenter) {
            navCenter.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    hamburger.classList.remove('open');
                    navCenter.classList.remove('mobile-open');
                });
            });
        }

        // Logout button
        const logoutBtn = document.getElementById('navLogoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }
    }

    // ============================================
    // Handle logout
    // ============================================
    async function handleLogout() {
        try {
            await fetch(`${API}/api/auth/logout`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (err) {
            // Ignore network errors during logout
        }
        // Clear any localStorage data if present
        localStorage.removeItem('user');
        // Redirect to login page
        window.location.href = 'index.html';
    }

    // ============================================
    // Fetch user data and initialize navbar
    // ============================================
    async function initNavbar() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const res = await fetch(`${API}/api/auth/me`, {
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const data = await res.json();

            if (!data.success) {
                // Not logged in - don't show navbar
                // The individual page JS will handle redirect
                return;
            }

            injectNavbar(data.user);

            // Make logout globally available (backward compatibility)
            window.logout = handleLogout;

        } catch (err) {
            // Silently fail - page JS will handle auth check
            console.warn('Navbar: Could not fetch user data');
        }
    }

    // ============================================
    // Initialize when DOM is ready
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNavbar);
    } else {
        initNavbar();
    }

})();
