/**
 * 将 mulaw 格式的音频数据转换为 PCM 格式
 * @param mulawData Base64 编码的 mulaw 音频数据
 * @returns Base64 编码的 PCM 音频数据
 */
export function mulawToPcm(mulawBuffer:Buffer<ArrayBuffer>): string {
    // 解码 base64
    const pcmBuffer = Buffer.alloc(mulawBuffer.length * 2);

    // μ-law 到 PCM 的转换表
    const MULAW_TO_PCM = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
        const mulaw = i ^ 0xFF;
        const sign = (mulaw & 0x80) ? -1 : 1;
        const exponent = ((mulaw & 0x70) >> 4);
        const mantissa = (mulaw & 0x0F);
        let pcm = sign * ((mantissa << 3) + 0x84) << exponent;
        pcm = pcm - 0x84;
        MULAW_TO_PCM[i] = pcm;
    }

    // 转换每个字节
    for (let i = 0; i < mulawBuffer.length; i++) {
        const pcm = MULAW_TO_PCM[mulawBuffer[i]];
        pcmBuffer.writeInt16LE(pcm, i * 2);
    }

    return pcmBuffer.toString('base64');
}

/**
 * 将 PCM 格式的音频数据转换为 mulaw 格式
 * @param pcmData PCM 音频数据
 * @returns Base64 编码的 mulaw 音频数据
 */
export function pcmToMulaw(pcmData: Buffer): Buffer {
    const mulawBuffer = Buffer.alloc(pcmData.length / 2);

    // PCM 到 μ-law 的转换表
    const PCM_TO_MULAW = new Uint8Array(65536);
    for (let i = 0; i < 65536; i++) {
        const pcm = i - 32768;
        const sign = (pcm < 0) ? 0x80 : 0;
        const absPcm = Math.abs(pcm);
        const exponent = Math.min(7, Math.floor(Math.log2(absPcm / 16)));
        const mantissa = Math.floor((absPcm >> (exponent + 3)) & 0x0F);
        const mulaw = sign | ((exponent << 4) | mantissa);
        PCM_TO_MULAW[i] = mulaw ^ 0xFF;
    }

    // 转换每个采样
    for (let i = 0; i < mulawBuffer.length; i++) {
        const pcm = pcmData.readInt16LE(i * 2) + 32768;
        mulawBuffer[i] = PCM_TO_MULAW[pcm];
    }

    return mulawBuffer;
} 