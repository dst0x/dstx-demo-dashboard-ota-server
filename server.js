require('dotenv').config();
const express = require('express');
const path = require('path');
const {
    clearSessionCookie,
    createSessionToken,
    readSession,
    requireAuth,
    setSessionCookie,
    verifyCredentials
} = require('./src/middlewares/auth');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.get('/index.html', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get(['/monitor', '/monitor.html'], requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'monitor.html'));
});
app.get(['/chat', '/chat.html'], requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});
app.get(['/review', '/review.html'], requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'review.html'));
});
app.get(['/modbus', '/modbus.html'], requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'modbus.html'));
});
app.use(express.static('public', { index: false }));

const adminRoutes = require('./src/routes/admin_routes');
const otaRoutes = require('./src/routes/ota_routes');
const { adminRouter: serialAdminRoutes, deviceRouter: serialDeviceRoutes } = require('./src/routes/serial_routes');
const { adminRouter: modbusAdminRoutes, deviceRouter: modbusDeviceRoutes } = require('./src/routes/modbus_routes');
const serialPortRoutes = require('./src/routes/serial_port_routes');
const chatRoutes = require('./src/routes/chat_routes');

app.get('/login', (req, res) => {
    if (readSession(req)) return res.redirect('/');
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!verifyCredentials(username, password)) return res.redirect('/login?error=1');

    setSessionCookie(res, createSessionToken(username));
    res.redirect('/');
});

app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(res);
    res.redirect('/login');
});

app.use('/api/admin', requireAuth, adminRoutes);
app.use('/api/admin/serial', requireAuth, serialAdminRoutes);
app.use('/api/admin/modbus', requireAuth, modbusAdminRoutes);
app.use('/api/admin/serialport', requireAuth, serialPortRoutes);
app.use('/api/admin/chat', requireAuth, chatRoutes);
app.use('/api/serial', serialDeviceRoutes);
app.use('/api/device/modbus', modbusDeviceRoutes);
app.use('/api/ota', otaRoutes);

app.get('/', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server berjalan di http://localhost:${port}`);
    });
}

module.exports = app;
