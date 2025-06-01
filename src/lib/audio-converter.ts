import { mulaw, utils } from 'x-law';

interface AudioFormat {
  encoding: 'audio/x-mulaw' | 'audio/pcm';
  sampleRate: number;
  channels: number;
}

export class AudioConverter {
  /**
   * 将 μ-law 格式转换为 PCM 格式
   */
  public static mulawToPcm(mulawData: Buffer): Buffer {
    return mulaw.decodeBuffer(mulawData);
  }

  /**
   * 将 PCM 格式转换为 μ-law 格式
   */
  public static pcmToMulaw(pcmData: Buffer): Buffer {
    return mulaw.encodeBuffer(pcmData);
  }

  /**
   * 转换采样率
   */
  public static resample(
    audioData: Buffer,
    fromSampleRate: number,
    toSampleRate: number,
    channels: number
  ): Buffer {
    if (fromSampleRate === toSampleRate) {
      return audioData;
    }

    // 将 Buffer 转换为 number[]
    const pcmSamples: number[] = [];
    for (let i = 0; i < audioData.length; i += 2) {
      pcmSamples.push(audioData.readInt16LE(i));
    }

    // 使用 x-law 的 resample 工具进行重采样
    const resampledSamples = utils.resample(
      pcmSamples,
      fromSampleRate,
      toSampleRate,
      16 // 16-bit PCM
    );

    // 将 number[] 转换回 Buffer
    const resampledBuffer = Buffer.alloc(resampledSamples.length * 2);
    resampledSamples.forEach((sample, index) => {
      resampledBuffer.writeInt16LE(sample, index * 2);
    });

    return resampledBuffer;
  }

  /**
   * 转换音频格式
   */
  public static convert(audioData: Buffer, fromFormat: AudioFormat, toFormat: AudioFormat): Buffer {
    if (!audioData || audioData.length === 0) {
      throw new Error('输入音频数据为空');
    }

    let convertedData = audioData;

    // 首先进行编码转换
    if (fromFormat.encoding === 'audio/x-mulaw' && toFormat.encoding === 'audio/pcm') {
      convertedData = this.mulawToPcm(convertedData);
    } else if (fromFormat.encoding === 'audio/pcm' && toFormat.encoding === 'audio/x-mulaw') {
      convertedData = this.pcmToMulaw(convertedData);
    }

    // 然后进行采样率转换
    if (fromFormat.sampleRate !== toFormat.sampleRate) {
      convertedData = this.resample(
        convertedData,
        fromFormat.sampleRate,
        toFormat.sampleRate,
        fromFormat.channels
      );
    }

    return convertedData;
  }
}
