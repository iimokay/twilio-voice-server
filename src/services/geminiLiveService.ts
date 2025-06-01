import { LiveConnectConfig } from '@google/genai';
import { GenAILiveClient } from '../lib/genaiLiveClient';
import { AudioStreamer } from '../lib/audio-streamer';
import { pcmToMulaw } from '../utils/audio';

interface GeminiLiveOptions {
    apiKey: string;
    model?: string;
    config?: LiveConnectConfig;
}

export class GeminiLiveService {
    private static instance: GeminiLiveService;
    private client: GenAILiveClient;
    private model: string;
    private config: LiveConnectConfig;
    private connected: boolean;
    private logger: Console;
    private audioStreamer: AudioStreamer;

    private constructor(options: GeminiLiveOptions) {
        this.client = new GenAILiveClient({ apiKey: options.apiKey });
        this.model = options.model || 'models/gemini-2.0-flash-exp';
        this.config = options.config || {};
        this.connected = false;
        this.logger = console;
        this.audioStreamer = new AudioStreamer();

        // 设置事件监听
        this.setupEventListeners();
    }

    public static getInstance(options: GeminiLiveOptions): GeminiLiveService {
        if (!GeminiLiveService.instance) {
            GeminiLiveService.instance = new GeminiLiveService(options);
        }
        return GeminiLiveService.instance;
    }

    private setupEventListeners(): void {
        this.client
            .on('open', () => {
                this.connected = true;
                this.logger.info('[GenAI] Connection opened');
            })
            .on('close', () => {
                this.connected = false;
                this.logger.info('[GenAI] Connection closed');
            })
            .on('interrupted', () => {
                this.connected = false;
                this.logger.warn('[GenAI] Connection interrupted');
            })
            .on('audio', (data: ArrayBuffer) => {
                this.connected = true;
                this.logger.debug(`[GenAI] Received audio data, size: ${data.byteLength} bytes`);
                // 处理音频数据
                this.audioStreamer.addPCM16(new Uint8Array(data));
            });

        // 监听 AudioStreamer 事件
        this.audioStreamer.on('data', (data: Float32Array) => {
            this.logger.debug(`[GenAI] Processing audio data, size: ${data.length} samples`);
        });

        this.audioStreamer.on('play', (data: Float32Array) => {
            this.logger.debug(`[GenAI] Playing audio data, size: ${data.length} samples`);
        });

        this.audioStreamer.on('complete', () => {
            this.logger.info('[GenAI] Audio playback completed');
        });

        this.audioStreamer.on('stop', () => {
            this.logger.info('[GenAI] Audio playback stopped');
        });
    }

    public async connect(): Promise<void> {
        if (!this.config) {
            throw new Error('Configuration has not been set');
        }

        try {
            this.client.disconnect();
            await this.client.connect(this.model, this.config);
            this.logger.info('[GenAI] Successfully connected');
        } catch (error) {
            this.logger.error('[GenAI] Failed to connect:', error);
            throw error;
        }
    }

    public async disconnect(): Promise<void> {
        try {
            this.client.disconnect();
            this.connected = false;
            this.audioStreamer.stop();
            this.logger.info('[GenAI] Successfully disconnected');
        } catch (error) {
            this.logger.error('[GenAI] Failed to disconnect:', error);
            throw error;
        }
    }

    public setConfig(config: LiveConnectConfig): void {
        this.config = config;
        this.logger.info('[GenAI] Updated configuration');
    }

    public setModel(model: string): void {
        this.model = model;
        this.logger.info(`[GenAI] Updated model to: ${model}`);
    }

    public isConnected(): boolean {
        return this.connected;
    }

    public getClient(): GenAILiveClient {
        return this.client;
    }

    public getModel(): string {
        return this.model;
    }

    public getConfig(): LiveConnectConfig {
        return this.config;
    }

    public async sendAudioData(audioData: Buffer): Promise<void> {
        if (!this.connected) {
            this.logger.warn('[GenAI] Not connected to Gemini Live');
            return;
        }

        try {
            this.client.sendRealtimeInput([{
                mimeType: "audio/pcm;rate=16000",
                data: audioData.toString('base64')
            }]);
        } catch (error) {
            this.logger.error('[GenAI] Failed to send audio data:', error);
            throw error;
        }
    }
} 