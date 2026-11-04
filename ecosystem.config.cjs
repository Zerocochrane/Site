// PM2 configuration — used by scripts/deploy-pm2.sh
module.exports = {
  apps: [
    {
      name: 'photo-portfolio',
      cwd: './server',
      script: 'index.js',
      exec_mode: 'fork',
      instances: 1, // keep 1: SQLite + in-memory rate limit
      autorestart: true,
      max_memory_restart: '300M',
      restart_delay: 3000,
      env: { NODE_ENV: 'production' },
      out_file: '../logs/out.log',
      error_file: '../logs/error.log',
      time: true,
    },
  ],
};
