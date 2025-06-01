import twilio from 'twilio';
import { TwilioConfig } from '../types';

export class TwilioService {
    private logger: Console;

    constructor(config: TwilioConfig) {
        this.logger = console;
        if (!this.validateConfig(config)) {
            throw new Error('Invalid Twilio configuration');
        }
    }

    public generateTwiML(streamUrl: string): string {
        try {
            const wsUrl = streamUrl.replace('https://', 'wss://');
            const response = new twilio.twiml.VoiceResponse();
            response.say('Hello, this is a test call.');
            response.connect()
                .stream({ url: wsUrl });

            this.logger.info('Generated TwiML response for stream URL:', wsUrl);
            return response.toString();
        } catch (error) {
            this.logger.error('Failed to generate TwiML:', error);
            throw new Error('Failed to generate TwiML response');
        }
    }

    public validateConfig(config: TwilioConfig): boolean {
        return !!(config.accountSid && config.authToken && config.phoneNumber);
    }
} 