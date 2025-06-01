import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 验证必需的环境变量
const requiredEnvVars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

export const env = {
    port: process.env.PORT || 3000,
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID!,
        authToken: process.env.TWILIO_AUTH_TOKEN!,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER!
    },
    environment: process.env.NODE_ENV || 'development'
}; 