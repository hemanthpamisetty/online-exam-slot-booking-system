/**
 * asyncHandler
 * Wraps async functions to catch errors and pass them to the global error handler
 * Prevents "unhandledRejection" crashes in production.
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { asyncHandler };
