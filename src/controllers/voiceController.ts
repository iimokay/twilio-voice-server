import { Context } from 'koa';
import { TwilioService } from '../services/twilioService';
import { VoiceStreamData, MediaFormat } from '../types';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import path from 'path';
import { GeminiLiveService } from '../services/geminiLiveService';
import { LiveConnectConfig } from '@google/genai';
import { mulawToPcm, pcmToMulaw } from '../utils/audio';

// Ensure environment variables are loaded
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

interface StreamInfo {
    ws: WebSocket;
    mediaFormat: MediaFormat;
    tracks: string[];
    callSid: string;
    messages: VoiceStreamData[];
    hasSeenMedia: boolean;
    geminiService: GeminiLiveService;
}

export class VoiceController {
    private static instance: VoiceController;
    private twilioService: TwilioService;
    private logger: Console;
    private activeStreams: Map<string, StreamInfo>;
    private readonly GENAI_MODEL = "models/gemini-2.0-flash-exp";
    private readonly GENAI_CONFIG: LiveConnectConfig = {
        // 添加必要的配置
    };

    private constructor() {
        const config = {
            accountSid: process.env.TWILIO_ACCOUNT_SID,
            authToken: process.env.TWILIO_AUTH_TOKEN,
            phoneNumber: process.env.TWILIO_PHONE_NUMBER
        };

        this.logger = console;
        this.twilioService = new TwilioService(config as any);

        // Validate Twilio configuration
        if (!this.twilioService.validateConfig(config as any)) {
            throw new Error('Invalid Twilio configuration');
        }

        this.activeStreams = new Map();
    }

    public static getInstance(): VoiceController {
        if (!VoiceController.instance) {
            VoiceController.instance = new VoiceController();
        }
        return VoiceController.instance;
    }

    public async handleIncomingCall(ctx: Context): Promise<void> {
        try {
            const host = ctx.hostname;
            const streamUrl = `wss://${host}/stream`;
            this.logger.info(`Handling incoming call with stream URL: ${streamUrl}`);

            const twiml = this.twilioService.generateTwiML(streamUrl);
            ctx.type = 'text/xml';
            ctx.body = twiml;

            this.logger.info('Successfully generated TwiML response');
        } catch (error) {
            this.logger.error('Failed to handle incoming call:', error);
            ctx.status = 500;
            ctx.body = {
                error: 'Internal server error',
                message: 'Failed to process incoming call'
            };
        }
    }

    private async initializeGeminiService(streamSid: string): Promise<GeminiLiveService> {
        const service = GeminiLiveService.getInstance({
            apiKey: process.env.GOOGLE_API_KEY || '',
            model: this.GENAI_MODEL,
            config: this.GENAI_CONFIG
        });

        // 设置事件处理器
        service.getClient().on('audio', (data: ArrayBuffer) => {
            const streamInfo = this.activeStreams.get(streamSid);
            if (streamInfo) {
                try {
                    // GenAI 返回的是 PCM 格式，需要转换为 mulaw
                    const pcmData = Buffer.from(data);
                    const mulawData = pcmToMulaw(pcmData);

                    const message = {
                        event: 'media',
                        streamSid,
                        media: {
                            payload: mulawData.toString('base64')
                        }
                    };
                    streamInfo.ws.send(JSON.stringify(message));
                    this.logger.info(`[Twilio] Sending audio data to stream ${streamSid} (mulaw)`);
                } catch (error) {
                    this.logger.error(`[Twilio] Error converting audio format for stream ${streamSid}:`, error);
                }
            }
        });

        try {
            await service.connect();
            this.logger.info('[GenAI] Service connected');
        } catch (error) {
            this.logger.error('[GenAI] Failed to connect:', error);
            throw error;
        }

        return service;
    }

    private async processMediaMessage(data: VoiceStreamData, streamInfo: StreamInfo): Promise<void> {
        if (!streamInfo.hasSeenMedia) {
            this.logger.info('[Twilio] Media event received:', data);
            streamInfo.hasSeenMedia = true;
        }

        // 将媒体消息存入缓冲区
        streamInfo.messages.push(data);

        // 当消息达到阈值时，发送给 GenAI
        if (streamInfo.messages.length >= 50) { // 可以根据需要调整阈值
            const messages = [...streamInfo.messages];
            streamInfo.messages = [];

            try {
                const messageByteBuffers = messages.map((msg) => {
                    if (!msg.media?.payload) {
                        throw new Error('Invalid media message: missing payload');
                    }
                    return Buffer.from(msg.media.payload, 'base64');
                });

                // 合并所有 mulaw 数据
                const mergedMulawData = Buffer.concat(messageByteBuffers);
                
                // 将 8kHz mulaw 转换为 16kHz PCM
                const pcmBase64 = mulawToPcm(mergedMulawData);
                const pcmData = Buffer.from(pcmBase64, 'base64');
                
                // 发送给 GenAI Live
                await streamInfo.geminiService.sendAudioData(pcmData);
                this.logger.info(`[GenAI] Sending audio data (PCM 16kHz, size: ${pcmData.length} bytes)`);
            } catch (error) {
                this.logger.error('[GenAI] Error processing audio data:', error);
                // 如果处理失败，将消息放回缓冲区
                streamInfo.messages = [...messages, ...streamInfo.messages];
            }
        }
    }

    public async handleStreamData(data: VoiceStreamData, ws: WebSocket): Promise<void> {
        try {
            const { streamSid } = data;

            switch (data.event) {
                case 'start':
                    if (data.start) {
                        const geminiService = await this.initializeGeminiService(streamSid);
                        const streamInfo: StreamInfo = {
                            ws,
                            mediaFormat: data.start.mediaFormat,
                            tracks: data.start.tracks,
                            callSid: data.start.callSid,
                            messages: [],
                            hasSeenMedia: false,
                            geminiService
                        };
                        this.activeStreams.set(streamSid, streamInfo);

                        this.logger.info('[Twilio] Start event received:', data);
                    }
                    break;

                case 'media':
                    const streamInfo = this.activeStreams.get(streamSid);
                    if (streamInfo && data.media) {
                        await this.processMediaMessage(data, streamInfo);
                    }
                    break;

                case 'mark':
                    this.logger.info('[Twilio] Mark event received:', data.mark);
                    break;

                case 'stop':
                    const stream = this.activeStreams.get(streamSid);
                    if (stream) {
                        this.logger.info('[Twilio] Close event received:', data);
                        this.closeStream(streamSid);
                    }
                    break;

                default:
                    this.logger.warn(`[Twilio] Unknown event type for stream ${streamSid}:`, data.event);
            }
        } catch (error) {
            this.logger.error(`[Twilio] Error handling stream data for ${data.streamSid}:`, error);
            throw new Error('Failed to process stream data');
        }
    }

    public getActiveStreams(): number {
        return this.activeStreams.size;
    }

    public async closeStream(streamSid: string): Promise<void> {
        const stream = this.activeStreams.get(streamSid);
        if (stream) {
            // 断开 GenAI Live 连接
            await stream.geminiService.disconnect();
            stream.ws.close();
            this.activeStreams.delete(streamSid);
            this.logger.info('[Twilio] Closed stream', streamSid);
        }
    }
}