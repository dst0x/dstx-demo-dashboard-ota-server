const crypto = require('crypto');

const COOKIE_NAME = 'mertani_ota_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function parseCookies(header = '') {
    return Object.fromEntries(
        header.split(';').map(value => value.trim()).filter(Boolean).map(value => {
            const separator = value.indexOf('=');
            return [value.slice(0, separator), decodeURIComponent(value.slice(separator + 1))];
        })
    );
}

function sign(payload) {
    return crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
}

function createSessionToken(username) {
    const payload = Buffer.from(JSON.stringify({
        username,
        expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000
    })).toString('base64url');

    return `${payload}.${sign(payload)}`;
}

function readSession(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (!token) return null;

    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;

    const expected = sign(payload);
    const receivedBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (receivedBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) return null;

    try {
        const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return session.expiresAt > Date.now() ? session : null;
    } catch {
        return null;
    }
}

function verifyCredentials(username, password) {
    const expectedUsername = process.env.ADMIN_USERNAME;
    const expectedPassword = process.env.ADMIN_PASSWORD;
    if (!expectedUsername || !expectedPassword) return false;

    const suppliedUsername = Buffer.from(String(username || ''));
    const validUsername = Buffer.from(expectedUsername);
    const usernameMatches = suppliedUsername.length === validUsername.length &&
        crypto.timingSafeEqual(suppliedUsername, validUsername);

    const suppliedPassword = Buffer.from(String(password || ''));
    const validPassword = Buffer.from(expectedPassword);
    const passwordMatches = suppliedPassword.length === validPassword.length &&
        crypto.timingSafeEqual(suppliedPassword, validPassword);

    return usernameMatches && passwordMatches;
}

function setSessionCookie(res, token) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`);
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

function requireAuth(req, res, next) {
    const session = readSession(req);
    if (!session) {
        if (req.path.startsWith('/api/') || req.originalUrl.startsWith('/api/')) {
            return res.status(401).json({ success: false, message: 'Autentikasi diperlukan' });
        }
        return res.redirect('/login');
    }
    req.admin = session;
    next();
}

module.exports = {
    clearSessionCookie,
    createSessionToken,
    readSession,
    requireAuth,
    setSessionCookie,
    verifyCredentials
};
