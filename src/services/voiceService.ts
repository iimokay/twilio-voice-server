import { LiveConnectConfig, Modality } from '@google/genai';
import WebSocket from 'ws';
import { env } from '../env';
import { AILiveClient } from '../lib/ai-live-client';
import { MediaFormat, VoiceStreamData } from '../types';

interface StreamInfo {
    ws: WebSocket;
    mediaFormat: MediaFormat;
    tracks: string[];
    callSid: string;
    liveClient: AILiveClient;
}

export class VoiceService {
    private static instance: VoiceService;
    private logger: Console;
    private activeStreams: Map<string, StreamInfo>;
    private readonly GENAI_MODEL = "models/gemini-2.0-flash-exp";
    private readonly GENAI_CONFIG: LiveConnectConfig = {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            languageCode: "cmn-CN",
            // voiceConfig: {
            //     prebuiltVoiceConfig: {
            //         voiceName: "Charon"
            //     }
            // }
        },
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

    private async initializeLiveClent(streamSid: string): Promise<AILiveClient> {
        const ai = new AILiveClient({ apiKey: env.google.apiKey });
        ai
            .on('audio', (data: ArrayBuffer) => {
                const streamInfo = this.activeStreams.get(streamSid);
                if (streamInfo) {
                    try {
                        streamInfo.ws.send(Buffer.from(data).toString("base64"));
                        this.logger.info(`[Twilio] Sending audio data to stream ${streamSid} (${streamInfo.tracks})`);
                    } catch (error) {
                        this.logger.error(`[Twilio] Error converting audio format for stream ${streamSid}:`, error);
                    }
                }
            })
            .on('open', () => {
                this.logger.info('[GenAI] Connection opened');
            })
            .on('close', () => {
                this.logger.info('[GenAI] Connection closed');
            })
            .on('interrupted', () => {
                this.logger.warn('[GenAI] Connection interrupted');
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

    public async handleStreamData(data: VoiceStreamData, ws: WebSocket): Promise<void> {
        try {
            const { streamSid } = data;
            switch (data.event) {
                case 'start':
                    if (data.start) {
                        const liveClient = await this.initializeLiveClent(streamSid);
                        const streamInfo: StreamInfo = {
                            ws,
                            mediaFormat: data.start.mediaFormat,
                            tracks: data.start.tracks,
                            callSid: data.start.callSid,
                            liveClient
                        };
                        this.activeStreams.set(streamSid, streamInfo);
                        this.logger.info('[VoiceService] Start event received:', data);
                    }
                    break;

                case 'media':
                    const streamInfo = this.activeStreams.get(streamSid);
                    if (streamInfo && data.media) {
                        if (streamInfo.tracks.includes('user_audio_input')) {
                            // 发送给 GenAI Live
                            streamInfo.liveClient.sendRealtimeInput([data.media]);
                        } else {
                            this.logger.info('[Twilio] Media event received:', data);
                        }
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
            stream.liveClient.disconnect();
            stream.ws.close();
            this.activeStreams.delete(streamSid);
            this.logger.info('[Twilio] Closed stream', streamSid);
        }
    }
}