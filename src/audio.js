// 录音转码工具：浏览器 MediaRecorder 采集为 webm/opus，转码为 16bit/16kHz WAV(PCM)
// 以兼容线上 ASR（硅基流动等只接受标准音频）。教师端与学生端答辩共用此模块，避免逻辑重复。

function encodeWav(audioBuffer, targetRate = 16000) {
  const channel = audioBuffer.getChannelData(0);
  const ratio = audioBuffer.sampleRate / targetRate;
  const newLen = Math.max(1, Math.round(channel.length / ratio));
  const samples = new Int16Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const s = Math.max(-1, Math.min(1, channel[Math.floor(i * ratio)]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) view.setInt16(off, samples[i], true);
  return new Blob([buffer], { type: 'audio/wav' });
}

async function recordingToWav(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return encodeWav(audioBuffer);
  } finally {
    if (ctx.state !== 'closed') ctx.close();
  }
}

export { encodeWav, recordingToWav };
