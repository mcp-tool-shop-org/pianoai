// ─── ai-jam-sessions: WAV Decoding ───────────────────────────────────────────
//
// A minimal RIFF/WAVE reader, so audio can enter the analysis layer without a
// dependency.
//
// WHY OUR OWN, AGAIN. `audio-decode` was the study's recommendation (finding
// 49) and it is MIT, but the analysis layer has stayed dependency-free through
// four chunks and this is the last piece needed to keep it that way. WAV is a
// small, stable, 1991 format; the subset we need is a header walk and an
// integer scale. The repo already WRITES wav in the vocal route
// (`src/vocal/svs-offline.ts`), so this is the missing counterpart rather than
// a new capability.
//
// WHAT IT HANDLES. Uncompressed PCM: 8-, 16-, 24- and 32-bit integer, plus
// 32- and 64-bit IEEE float. WAVE_FORMAT_EXTENSIBLE is resolved through its
// sub-format GUID. Chunks are walked rather than assumed, because real files
// put LIST/INFO metadata between `fmt ` and `data` and a reader that assumes a
// 44-byte header silently reads metadata as audio.
//
// WHAT IT DOES NOT. No compressed formats: no MP3, no ADPCM, no A-law. Those
// fail with a message naming the format rather than returning noise.
//
// MONO BY DEFAULT. Every analyser downstream is monophonic, so multi-channel
// input is averaged to one channel unless the caller asks otherwise. Averaging
// rather than taking channel 0 keeps a hard-panned take audible.
//
// Usage:
//   const audio = decodeWav(readFileSync("take.wav"));
//   trackPitch(audio.samples, { sampleRate: audio.sampleRate });
// ─────────────────────────────────────────────────────────────────────────────

/** Decoded audio, ready for the analysis layer. */
export interface DecodedAudio {
  /** Mono sample data in [-1, 1], unless `keepChannels` was requested. */
  samples: Float64Array;
  sampleRate: number;
  /** Channels in the SOURCE file, before any downmix. */
  sourceChannels: number;
  durationSec: number;
  /** Bit depth of the source, for reporting. */
  bitDepth: number;
  /** True when the source was multi-channel and has been averaged to mono. */
  downmixed: boolean;
}

/** Options for {@link decodeWav}. */
export interface DecodeWavOptions {
  /**
   * Return the first channel only instead of averaging all of them. Averaging
   * is the default because it keeps a hard-panned performance audible.
   */
  firstChannelOnly?: boolean;
}

const FORMAT_PCM = 0x0001;
const FORMAT_IEEE_FLOAT = 0x0003;
const FORMAT_ALAW = 0x0006;
const FORMAT_MULAW = 0x0007;
const FORMAT_EXTENSIBLE = 0xfffe;

function formatName(code: number): string {
  switch (code) {
    case FORMAT_PCM: return "PCM";
    case FORMAT_IEEE_FLOAT: return "IEEE float";
    case FORMAT_ALAW: return "A-law";
    case FORMAT_MULAW: return "mu-law";
    case FORMAT_EXTENSIBLE: return "WAVE_FORMAT_EXTENSIBLE";
    default: return `unknown format 0x${code.toString(16)}`;
  }
}

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * Decode an uncompressed WAV file.
 *
 * Accepts a Node Buffer, a Uint8Array, or an ArrayBuffer.
 */
export function decodeWav(
  input: ArrayBuffer | Uint8Array,
  options: DecodeWavOptions = {},
): DecodedAudio {
  const bytes = input instanceof Uint8Array
    ? input
    : new Uint8Array(input);

  if (bytes.byteLength < 12) {
    throw new Error(
      `Not a WAV file: only ${bytes.byteLength} bytes, too short for a RIFF header.`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const riff = readTag(view, 0);
  const wave = readTag(view, 8);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error(
      `Not a WAV file: expected a "RIFF….WAVE" header, found ` +
      `"${riff}….${wave}". If this is an MP3, FLAC or OGG, decode it to WAV first.`,
    );
  }

  let formatCode = -1;
  let channels = 0;
  let sampleRate = 0;
  let bitDepth = 0;
  let dataStart = -1;
  let dataLength = 0;

  // Walk the chunk list. Real files interleave LIST/INFO/fact chunks, so the
  // 44-byte-header shortcut is wrong on anything but the simplest file.
  let cursor = 12;
  while (cursor + 8 <= bytes.byteLength) {
    const id = readTag(view, cursor);
    const size = view.getUint32(cursor + 4, true);
    const body = cursor + 8;

    if (id === "fmt ") {
      if (body + 16 > bytes.byteLength) {
        throw new Error(`Truncated "fmt " chunk: needs 16 bytes, file ends first.`);
      }
      formatCode = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitDepth = view.getUint16(body + 14, true);

      if (formatCode === FORMAT_EXTENSIBLE && size >= 40) {
        // The real format lives in the first two bytes of the sub-format GUID.
        formatCode = view.getUint16(body + 24, true);
      }
    } else if (id === "data") {
      dataStart = body;
      // A streamed file can carry a zero or 0xFFFFFFFF size; trust the file
      // length in that case rather than reading past the end.
      dataLength = size === 0 || body + size > bytes.byteLength
        ? bytes.byteLength - body
        : size;
    }

    // Chunks are word-aligned: an odd size is followed by a pad byte.
    cursor = body + size + (size % 2);
  }

  if (formatCode < 0) {
    throw new Error(`WAV file has no "fmt " chunk, so its format is unknown.`);
  }
  if (dataStart < 0) {
    throw new Error(`WAV file has no "data" chunk, so it contains no audio.`);
  }
  if (formatCode !== FORMAT_PCM && formatCode !== FORMAT_IEEE_FLOAT) {
    throw new Error(
      `Unsupported WAV encoding: ${formatName(formatCode)}. This reader handles ` +
      `uncompressed PCM and IEEE float only. Re-export the file as PCM WAV.`,
    );
  }
  if (!(channels > 0)) {
    throw new Error(`WAV header declares ${channels} channels.`);
  }
  if (!(sampleRate > 0)) {
    throw new Error(`WAV header declares a sample rate of ${sampleRate} Hz.`);
  }

  const bytesPerSample = bitDepth / 8;
  if (!Number.isInteger(bytesPerSample) || bytesPerSample < 1) {
    throw new Error(`WAV header declares a bit depth of ${bitDepth}.`);
  }

  const frameCount = Math.floor(dataLength / (bytesPerSample * channels));
  const wantMono = channels > 1 && !options.firstChannelOnly;
  const out = new Float64Array(frameCount);

  const readOne = (offset: number): number => {
    switch (bitDepth) {
      case 8:
        // 8-bit WAV is UNSIGNED, centred on 128. Every other depth is signed.
        return (view.getUint8(offset) - 128) / 128;
      case 16:
        return view.getInt16(offset, true) / 32768;
      case 24: {
        const lo = view.getUint8(offset);
        const mid = view.getUint8(offset + 1);
        const hi = view.getInt8(offset + 2);
        return ((hi << 16) | (mid << 8) | lo) / 8388608;
      }
      case 32:
        return formatCode === FORMAT_IEEE_FLOAT
          ? view.getFloat32(offset, true)
          : view.getInt32(offset, true) / 2147483648;
      case 64:
        return view.getFloat64(offset, true);
      default:
        throw new Error(
          `Unsupported bit depth ${bitDepth}. Handled: 8, 16, 24, 32, 64.`,
        );
    }
  };

  const stride = bytesPerSample * channels;
  for (let f = 0; f < frameCount; f++) {
    const base = dataStart + f * stride;
    if (options.firstChannelOnly || channels === 1) {
      out[f] = readOne(base);
    } else {
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += readOne(base + c * bytesPerSample);
      out[f] = sum / channels;
    }
  }

  return {
    samples: out,
    sampleRate,
    sourceChannels: channels,
    durationSec: frameCount / sampleRate,
    bitDepth,
    // Selecting one channel is not a downmix. This flag means "several
    // channels were AVERAGED into one", which is the thing a caller might want
    // to know about when a reading looks unexpectedly quiet.
    downmixed: wantMono,
  };
}
