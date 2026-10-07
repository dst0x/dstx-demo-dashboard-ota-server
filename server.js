require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const adminRoutes = require('./src/routes/admin_routes');
const otaRoutes = require('./src/routes/ota_routes');

app.use('/api/admin', adminRoutes);
app.use('/api/ota', otaRoutes);

app.get('/', (req, res) => {
    res.send('OTA Server STM32 Development Ready');
});

app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});