/**
 * socket.js — Singleton IO accessor
 *
 * WHY THIS EXISTS:
 * uptimeChecker.js was doing `require('../server')` to access `io`.
 * But server.js already requires uptimeChecker.js at startup, creating a
 * circular dependency. Node.js returns a partially-constructed exports object
 * for server.js, so `io` was always `undefined` and socket events silently
 * never fired.
 *
 * FIX: Both server.js and any job/service call setIO() / getIO() here.
 * No circular require needed.
 */

let _io = null;

/** Called once in server.js after `new Server(httpServer, ...)` */
const setIO = (ioInstance) => {
    _io = ioInstance;
};

/** Called anywhere that needs to emit socket events */
const getIO = () => _io;

module.exports = { setIO, getIO };
