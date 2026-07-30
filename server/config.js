// ============================================================
// Server Configuration
// Edit ADMIN_PASSWORD before deploying!
// ============================================================
module.exports = {
  PORT: process.env.PORT || 3000,

  // Password untuk login dashboard admin
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',

  // Secret key untuk session (ganti dengan string random yang panjang)
  SESSION_SECRET: process.env.SESSION_SECRET || 'lab-remote-secret-change-me-2024',
};
