import { LiveConnectConfig } from '@google/genai';
import WebSocket from 'ws';
import { env } from '../env';
import { GenAILiveClient } from '../lib/genaiLiveClient';
import { MediaFormat, VoiceStreamData } from '../types';
import { mulawToPcm, pcmToMulaw } from '../utils/audio';

interface StreamInfo {
    ws: WebSocket;
    mediaFormat: MediaFormat;
    tracks: string[];
    callSid: string;
    messages: VoiceStreamData[];
    hasSeenMedia: boolean;
    geminiLiveClient: GenAILiveClient;
}

export class VoiceService {
    private static instance: VoiceService;
    private logger: Console;
    private activeStreams: Map<string, StreamInfo>;
    private readonly GENAI_MODEL = "models/gemini-2.0-flash-exp";
    private readonly GENAI_CONFIG: LiveConnectConfig = {
        // 添加必要的配置
    };

    private constructor() {
        this.logger = console;
        this.activeStreams = new Map();
    }

    public static getInstance(): VoiceService {
        if (!VoiceService.instance) {
            VoiceService.instance = new VoiceService();
        }
        return VoiceService.instance;
    }

    private async initializeLiveClent(streamSid: string): Promise<GenAILiveClient> {
        const ai = new GenAILiveClient({ apiKey: env.google.apiKey });
        // 设置事件处理器
        ai.on('open', () => {
            this.logger.info('[GenAI] Connection opened');
        })
            .on('close', () => {
                this.logger.info('[GenAI] Connection closed');
            })
            .on('interrupted', () => {
                this.logger.warn('[GenAI] Connection interrupted');
            }).on('audio', (data: ArrayBuffer) => {
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
            await ai.connect(this.GENAI_MODEL, this.GENAI_CONFIG);
            this.logger.info('[GenAI] Service connected');
        } catch (error) {
            this.logger.error('[GenAI] Failed to connect:', error);
            throw error;
        }
        return ai;
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
                streamInfo.geminiLiveClient.sendRealtimeInput([{ mimeType: 'audio/pcm;sampleRate=16000', data: pcmData.toString('base64') }]);
                this.logger.info(`[GenAI] Sending audio data (PCM 16kHz, size: ${pcmData.length} bytes)`);
            } catch (error) {
                this.logger.error('[GenAI] Error processing audio data:', error);
                // 如果处理失败，将消息放回缓冲区
                streamInfo.messages = [...messages, ...streamInfo.messages];
            }
        }
    }

    public async handleStreamData(data: VoiceStreamData & { event: string }, ws: WebSocket): Promise<void> {
        try {
            const { streamSid } = data;

            switch (data.event) {
                case 'start':
                    if (data.start) {
                        const geminiLiveClient = await this.initializeLiveClent(streamSid);
                        const streamInfo: StreamInfo = {
                            ws,
                            mediaFormat: data.start.mediaFormat,
                            tracks: data.start.tracks,
                            callSid: data.start.callSid,
                            messages: [],
                            hasSeenMedia: false,
                            geminiLiveClient
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
            stream.geminiLiveClient.disconnect();
            stream.ws.close();
            this.activeStreams.delete(streamSid);
            this.logger.info('[Twilio] Closed stream', streamSid);
        }
    }
}