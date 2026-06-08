// PM2 — La Madriguera QR System
// Uso: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'la-madriguera-qr',
      script: 'server.js',
      node_args: '--experimental-sqlite',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3012,
      },
    },
  ],
};
