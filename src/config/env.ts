import { cleanEnv, str, num } from 'envalid';

export const env = cleanEnv(process.env, {
  // DATABASE
  DB_HOST: str({ default: 'localhost' }),
  DB_PORT: num({ default: 3306 }),
  DB_DATABASE: str({ default: 'dbauth' }),
  DB_USERNAME: str({ default: 'root' }),
  DB_PASSWORD: str({ default: 'admin' }),

  // SERVER
  PORT: num({ default: 5000 }),

  // URL
  FRONTEND_URL: str({ default: 'http://localhost:3000' }),

  // CORS
  CORS_EXPIRES: num({ default: 3600 }),

  // NODE_ENV
  NODE_ENV: str({ choices: ['development', 'production'], default: 'development' }),
});
