// PM2 ecosystem config for the Mitmachim Draft Sync server.
//
// Usage (from the repo, after `npm run build:server`):
//   pm2 start server/scripts/ecosystem.config.cjs
//   pm2 save && pm2 startup
//
// Notes:
//   - The app loads its environment from server/.env itself via dotenv
//     (the root .env is also loaded as a fallback). PM2 does NOT need to
//     inject the .env here; only NODE_ENV is set below so the app runs in
//     production mode and enforces SYNC_KEY_PEPPER.
//   - `cwd` MUST be the server directory so relative paths resolve correctly,
//     in particular DB_PATH (default ./data/draftsync.db) and server/.env.
//     This file lives in server/scripts, so the server directory is '..'.
//   - `script` is relative to `cwd`, i.e. server/dist/index.js.

module.exports = {
  apps: [
    {
      name: 'mds-server',
      script: 'dist/index.js',
      // Server directory, relative to this config file (server/scripts/).
      cwd: '..',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
      // Prefix PM2 log lines with timestamps.
      time: true,
    },
  ],
};
