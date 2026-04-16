/**
 * Shared Utilities — Async handler + validation helpers
 */

/**
 * asyncHandler
 * Wraps async functions to catch errors and pass them to the global error handler.
 * Prevents "unhandledRejection" crashes in production.
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Validate that an email looks roughly correct.
 * Not exhaustive — just blocks obvious garbage.
 */
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Validate that a value is a positive integer (or can be parsed as one).
 */
function isPositiveInt(val) {
    const n = Number(val);
    return Number.isInteger(n) && n > 0;
}

/**
 * Validate date string is YYYY-MM-DD.
 */
function isValidDate(str) {
    if (!str || typeof str !== 'string') return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(str.trim()) && !isNaN(Date.parse(str.trim()));
}

/**
 * Validate time string is HH:MM or HH:MM:SS.
 */
function isValidTime(str) {
    if (!str || typeof str !== 'string') return false;
    return /^\d{2}:\d{2}(:\d{2})?$/.test(str.trim());
}

module.exports = { asyncHandler, isValidEmail, isPositiveInt, isValidDate, isValidTime };
