/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { EventEmitter } from 'events';

export class AudioStreamer extends EventEmitter {
    private sampleRate: number = 16000;
    private bufferSize: number = 7680;
    private audioQueue: Float32Array[] = [];
    private isPlaying: boolean = false;
    private isStreamComplete: boolean = false;
    private checkInterval: NodeJS.Timeout | null = null;
    private scheduledTime: number = 0;
    private initialBufferTime: number = 0.1; // 100ms initial buffer

    constructor() {
        super();
        this.addPCM16 = this.addPCM16.bind(this);
    }

    /**
     * 将 PCM16 音频数据转换为 Float32Array
     */
    private _processPCM16Chunk(chunk: Uint8Array): Float32Array {
        const float32Array = new Float32Array(chunk.length / 2);
        const dataView = new DataView(chunk.buffer);

        for (let i = 0; i < chunk.length / 2; i++) {
            try {
                const int16 = dataView.getInt16(i * 2, true);
                float32Array[i] = int16 / 32768;
            } catch (e) {
                console.error('[AudioStreamer] Error processing PCM16 chunk:', e);
            }
        }
        return float32Array;
    }

    /**
     * 添加 PCM16 格式的音频数据
     */
    addPCM16(chunk: Uint8Array) {
        // 重置流完成标志
        this.isStreamComplete = false;
        
        // 处理音频数据
        let processingBuffer = this._processPCM16Chunk(chunk);
        
        // 将处理后的数据添加到队列
        while (processingBuffer.length >= this.bufferSize) {
            const buffer = processingBuffer.slice(0, this.bufferSize);
            this.audioQueue.push(buffer);
            processingBuffer = processingBuffer.slice(this.bufferSize);
        }
        
        // 添加剩余的数据
        if (processingBuffer.length > 0) {
            this.audioQueue.push(processingBuffer);
        }

        // 触发数据处理事件
        this.emit('data', processingBuffer);

        // 如果没有在播放，开始播放
        if (!this.isPlaying) {
            this.isPlaying = true;
            this.scheduledTime = Date.now() / 1000 + this.initialBufferTime;
            this.scheduleNextBuffer();
        }
    }

    private scheduleNextBuffer() {
        const SCHEDULE_AHEAD_TIME = 0.2;
        const currentTime = Date.now() / 1000;

        while (
            this.audioQueue.length > 0 &&
            this.scheduledTime < currentTime + SCHEDULE_AHEAD_TIME
        ) {
            const audioData = this.audioQueue.shift()!;
            this.emit('play', audioData);
            this.scheduledTime = currentTime + (audioData.length / this.sampleRate);
        }

        if (this.audioQueue.length === 0) {
            if (this.isStreamComplete) {
                this.isPlaying = false;
                if (this.checkInterval) {
                    clearInterval(this.checkInterval);
                    this.checkInterval = null;
                }
                this.emit('complete');
            } else {
                if (!this.checkInterval) {
                    this.checkInterval = setInterval(() => {
                        if (this.audioQueue.length > 0) {
                            this.scheduleNextBuffer();
                        }
                    }, 100);
                }
            }
        } else {
            const nextCheckTime = (this.scheduledTime - currentTime) * 1000;
            setTimeout(
                () => this.scheduleNextBuffer(),
                Math.max(0, nextCheckTime - 50)
            );
        }
    }

    stop() {
        this.isPlaying = false;
        this.isStreamComplete = true;
        this.audioQueue = [];
        this.scheduledTime = Date.now() / 1000;

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        this.emit('stop');
    }

    resume() {
        this.isStreamComplete = false;
        this.scheduledTime = Date.now() / 1000 + this.initialBufferTime;
        this.emit('resume');
    }

    complete() {
        this.isStreamComplete = true;
        this.emit('complete');
    }
}

// // Usage example:
// const audioStreamer = new AudioStreamer();
//
// // In your streaming code:
// function handleChunk(chunk: Uint8Array) {
//   audioStreamer.handleChunk(chunk);
// }
//
// // To start playing (call this in response to a user interaction)
// await audioStreamer.resume();
//
// // To stop playing
// // audioStreamer.stop();
