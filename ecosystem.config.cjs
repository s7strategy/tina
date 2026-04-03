// PM2 Ecosystem - TINA SaaS
// cluster mode: aproveita todos os CPUs do VPS para máxima performance
module.exports = {
  apps: [
    {
      name: 'tina-backend',
      script: './backend/src/server.js',
      cwd: '/var/www/tina1',
      instances: 'max',       // usa todos os núcleos disponíveis
      exec_mode: 'cluster',   // modo cluster (load balancing automático)
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      // Reiniciar automaticamente se usar mais de 500MB
      max_memory_restart: '500M',
      // Logs
      error_file: '/var/log/tina/error.log',
      out_file: '/var/log/tina/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
