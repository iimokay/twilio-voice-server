import { Part } from '@google/genai';
import WebSocket from 'ws';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

export interface MediaFormat {
  encoding: string;
  sampleRate: number;
  channels: number;
}

export interface StreamStart {
  accountSid: string;
  callSid: string;
  tracks: string[];
  mediaFormat: MediaFormat;
  customParameters: Record<string, unknown>;
}

export interface StreamMedia {
  track: string;
  chunk: string;
  timestamp: string;
  payload: string;
}

export interface StreamMark {
  name: string;
}

export interface StreamStop {
  accountSid: string;
  callSid: string;
  streamSid: string;
  duration?: string;
}

export interface VoiceStreamData {
  event: string;
  streamSid: string;
  start?: StreamStart;
  media?: StreamMedia;
  mark?: StreamMark;
  stop?: StreamStop;
}

export interface StreamInfo {
  ws: WebSocket;
  mediaFormat: MediaFormat;
  tracks: string[];
  callSid: string;
}
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

/** log types */
export interface StreamingLog {
  date: Date;
  type: string;
  message: unknown;
}

export type ClientContentLog = {
  turns: Part[];
  turnComplete: boolean;
};
