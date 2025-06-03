import { LiveConnectConfig, Modality } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { WaveFile } from 'wavefile';
import WebSocket from 'ws';
import { env } from '../env';
import { AILiveClient } from '../lib/ai-live-client';
import { AudioConverter } from '../lib/audio-converter';
import { MediaFormat, VoiceStreamData } from '../types';

interface StreamInfo {
  ws: WebSocket;
  mediaFormat: MediaFormat;
  tracks: string[];
  callSid: string;
  liveClient: AILiveClient;
  mediaBuffer: Int16Array[];
}

export class VoiceService {
  private static instance: VoiceService;
  private logger: Console;
  private activeStreams: Map<string, StreamInfo>;
  private readonly GENAI_MODEL = 'gemini-2.0-flash-live-001';
  private readonly GENAI_CONFIG: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    tools: [{ googleSearch: {} }],
    systemInstruction: {
      text: `你是小爱同学，请用中文回答用户的问题。现在时间是${new Date().toUTCString()}`,
    },
    speechConfig: {
      languageCode: 'cmn-CN',
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: 'Leda',
        },
      },
    },
  };
  private readonly RECORDINGS_DIR = path.join(process.cwd(), 'wavFiles');

  private constructor() {
    this.logger = console;
    this.activeStreams = new Map();
    // 确保录音目录存在
    if (!fs.existsSync(this.RECORDINGS_DIR)) {
      fs.mkdirSync(this.RECORDINGS_DIR, { recursive: true });
    }
  }

  public static getInstance(): VoiceService {
    if (!VoiceService.instance) {
      VoiceService.instance = new VoiceService();
    }
    return VoiceService.instance;
  }

  private saveWavFile(samples: Int16Array[], outputPath: string, sampleRate: number = 16000): void {
    try {
      const waveFile = new WaveFile();
      // 将所有样本合并成一个数组
      const allSamples = new Int16Array(samples.reduce((acc, curr) => acc + curr.length, 0));
      let offset = 0;
      for (const sample of samples) {
        allSamples.set(sample, offset);
        offset += sample.length;
      }
      waveFile.fromScratch(1, sampleRate, '16', Array.from(allSamples));
      fs.writeFileSync(outputPath, waveFile.toBuffer());
      this.logger.info(`[GenAI] Saved audio file to ${outputPath}`);
    } catch (error) {
      this.logger.error(`[GenAI] Error saving audio file:`, error);
    }
  }

  private async initializeLiveClent(streamSid: string): Promise<AILiveClient> {
    const ai = new AILiveClient({ apiKey: env.google.apiKey });
    // ai.on('log', data => {
    //   this.logger.info(`[GenAI] Log:`, data);
    // });
    ai.on('audio', data => {
      const streamInfo = this.activeStreams.get(streamSid);
      if (streamInfo) {
        try {
          // 添加到输出缓冲区
          const pcmData = Buffer.from(data.payload, 'base64');
          const samples = new Int16Array(pcmData.buffer);
          streamInfo.mediaBuffer.push(samples);
          this.logger.info(
            `[LiveClient] Sending user audio data to stream(${streamInfo.tracks}) ${streamSid} data:${data.mimeType}`
          );
          //Gemini 生成音频 pcm 转 mulaw 发送给twilio/user
          if (!streamInfo.tracks.includes('user_audio_input')) {
            // 转换为mulaw
            const pcmToMulaw = AudioConverter.convert(
              pcmData,
              { encoding: 'audio/pcm', sampleRate: 24000 },
              { encoding: 'audio/x-mulaw', sampleRate: 8000 }
            );
            streamInfo.ws.send(
              JSON.stringify({
                event: 'media',
                streamSid,
                media: {
                  payload: pcmToMulaw.toString('base64'),
                },
              })
            );
          } else {
            // 发送原始数据
            streamInfo.ws.send(data.payload);
          }
        } catch (error) {
          this.logger.error(
            `[LiveClient] Error converting audio format for stream ${streamSid}:`,
            error
          );
        }
      }
    })
      .on('open', () => {
        this.logger.info('[GenAI] Connection opened');
      })
      .on('close', () => {
        this.logger.info('[GenAI] Connection closed', streamSid);
        const streamInfo = this.activeStreams.get(streamSid);
        // 保存输出音频文件
        if (streamInfo && streamInfo.mediaBuffer.length > 0) {
          const outputPath = path.join(
            this.RECORDINGS_DIR,
            `${Date.now()}_${streamInfo.callSid}.wav`
          );
          this.saveWavFile(streamInfo.mediaBuffer, outputPath, 24000);
        }
        this.activeStreams.delete(streamSid);
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
      const streamInfo = this.activeStreams.get(streamSid);
      switch (data.event) {
        case 'start':
          if (data.start) {
            const liveClient = await this.initializeLiveClent(streamSid);
            const streamInfo: StreamInfo = {
              ws,
              mediaFormat: data.start.mediaFormat,
              tracks: data.start.tracks,
              callSid: data.start.callSid,
              liveClient,
              mediaBuffer: [],
            };
            this.activeStreams.set(streamSid, streamInfo);
            this.logger.info('[GenAI] Start event received:', data);
          }
          break;
        case 'media':
          if (streamInfo && data.media) {
            let pcmData = data.media.payload;
            if (!streamInfo.tracks.includes('user_audio_input')) {
              pcmData = AudioConverter.convert(
                Buffer.from(pcmData, 'base64'),
                streamInfo.mediaFormat,
                {
                  encoding: 'audio/pcm',
                  sampleRate: 16000,
                }
              ).toString('base64');
            }
            streamInfo.liveClient.sendRealtimeInput([
              {
                mimeType: 'audio/pcm;rate=16000',
                data: pcmData,
              },
            ]);
            streamInfo.mediaBuffer.push(new Int16Array(Buffer.from(pcmData, 'base64').buffer));
          }
          break;

        case 'mark':
          this.logger.info('[GenAI] Mark event received:', data.mark);
          break;

        case 'stop':
          if (streamInfo) {
            this.logger.info('[GenAI] Close event received:', data);
            this.closeStream(streamSid);
          }
          break;

        default:
          this.logger.warn(`[GenAI] Unknown event type for stream ${streamSid}:`, data.event);
      }
    } catch (error) {
      this.logger.warn(`[GenAI] Error handling stream data for ${data.streamSid}:`, error);
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
      this.logger.info('[GenAI] Closed stream', streamSid);
    }
  }
}
