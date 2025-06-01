import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 验证必需的环境变量
const requiredEnvVars = ['GOOGLE_API_KEY'];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

export const env = {
  port: process.env.PORT || 3000,
  environment: process.env.NODE_ENV || 'development',
  google: {
    apiKey: process.env.GOOGLE_API_KEY!,
  },
};
