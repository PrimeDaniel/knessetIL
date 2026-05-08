module.exports = {
  apps: [
    {
      name: 'knesset-web',
      script: 'pnpm',
      args: 'start',
      cwd: './apps/web',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NEXT_PUBLIC_API_URL: 'https://yourdomain.com/api', // IMPORTANT: Update this to your domain!
      },
    },
    {
      name: 'knesset-api',
      script: './venv/bin/uvicorn',
      args: 'app.main:app --host 127.0.0.1 --port 8000',
      cwd: './apps/api',
      env: {
        APP_ENV: 'production',
        ALLOWED_ORIGINS: 'https://yourdomain.com', // IMPORTANT: Update this to your domain!
        DATABASE_URL: 'postgresql+asyncpg://knesset:knesset@localhost:5432/knessetil',
        REDIS_URL: 'redis://localhost:6379',
      },
    },
  ],
};
