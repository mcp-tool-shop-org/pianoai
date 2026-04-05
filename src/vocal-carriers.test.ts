import { describe, it, expect } from "vitest";
import { filenameToMidi, pickCarrier, defaultCarrierDir } from "./vocal-carriers.js";
import type { CarrierBank, VocalCarrier } from "./vocal-carriers.js";

describe("filenameToMidi", () => {
  it("parses natural note carriers", () => {
    expect(filenameToMidi("carrier-c4.wav")).toBe(60);
    expect(filenameToMidi("carrier-a4.wav")).toBe(69);
    expect(filenameToMidi("carrier-b3.wav")).toBe(59);
    expect(filenameToMidi("carrier-e3.wav")).toBe(52);
  });

  it("parses sharp note carriers", () => {
    expect(filenameToMidi("carrier-cs4.wav")).toBe(61);  // C#4
    expect(filenameToMidi("carrier-fs2.wav")).toBe(42);  // F#2
    expect(filenameToMidi("carrier-gs2.wav")).toBe(44);  // G#2
    expect(filenameToMidi("carrier-ds3.wav")).toBe(51);  // D#3
    expect(filenameToMidi("carrier-as4.wav")).toBe(70);  // A#4
  });

  it("maps C2 to MIDI 36", () => {
    expect(filenameToMidi("carrier-c2.wav")).toBe(36);
  });

  it("maps C7 to MIDI 96", () => {
    expect(filenameToMidi("carrier-c7.wav")).toBe(96);
  });

  it("returns null for invalid filenames", () => {
    expect(filenameToMidi("not-a-carrier.wav")).toBeNull();
    expect(filenameToMidi("carrier-x4.wav")).toBeNull();
    expect(filenameToMidi("carrier-c.wav")).toBeNull();
    expect(filenameToMidi("carrier-c4.mp3")).toBeNull();
    expect(filenameToMidi("")).toBeNull();
    expect(filenameToMidi("carrier-.wav")).toBeNull();
  });

  it("is case-insensitive for note name", () => {
    expect(filenameToMidi("carrier-C4.wav")).toBe(60);
    expect(filenameToMidi("carrier-Fs2.wav")).toBe(42);
    expect(filenameToMidi("carrier-A4.wav")).toBe(69);
  });

  it("maps C0 to MIDI 12", () => {
    expect(filenameToMidi("carrier-c0.wav")).toBe(12);
  });

  it("maps B7 to MIDI 107", () => {
    expect(filenameToMidi("carrier-b7.wav")).toBe(107);
  });

  it("all 12 chromatic notes map to correct MIDI offsets", () => {
    // Octave 4: C4=60, C#4=61, D4=62, ..., B4=71
    const expected: Record<string, number> = {
      "carrier-c4.wav": 60,
      "carrier-cs4.wav": 61,
      "carrier-d4.wav": 62,
      "carrier-ds4.wav": 63,
      "carrier-e4.wav": 64,
      "carrier-f4.wav": 65,
      "carrier-fs4.wav": 66,
      "carrier-g4.wav": 67,
      "carrier-gs4.wav": 68,
      "carrier-a4.wav": 69,
      "carrier-as4.wav": 70,
      "carrier-b4.wav": 71,
    };
    for (const [filename, midi] of Object.entries(expected)) {
      expect(filenameToMidi(filename)).toBe(midi);
    }
  });
});

describe("pickCarrier", () => {
  it("returns null for empty bank", () => {
    expect(pickCarrier({ carriers: [] }, 60)).toBeNull();
  });

  it("returns rate 1.0 for exact match", () => {
    const bank = {
      carriers: [
        { referenceMidi: 60, buffer: {}, filename: "carrier-c4.wav" },
      ],
    };
    const result = pickCarrier(bank, 60);
    expect(result).not.toBeNull();
    expect(result!.rate).toBeCloseTo(1.0);
  });

  it("picks nearest carrier and adjusts rate", () => {
    const bank = {
      carriers: [
        { referenceMidi: 48, buffer: {}, filename: "carrier-c3.wav" },
        { referenceMidi: 60, buffer: {}, filename: "carrier-c4.wav" },
      ],
    };
    // Target E3 (MIDI 52) — closer to C3 (48) than C4 (60)
    const result = pickCarrier(bank, 52);
    expect(result).not.toBeNull();
    expect(result!.carrier.referenceMidi).toBe(48);
    // Rate = 2^(4/12) ≈ 1.26
    expect(result!.rate).toBeCloseTo(Math.pow(2, 4 / 12), 4);
  });

  it("picks the higher carrier when target is closer above", () => {
    const bank: CarrierBank = {
      carriers: [
        { referenceMidi: 48, buffer: {} as any, filename: "carrier-c3.wav" },
        { referenceMidi: 60, buffer: {} as any, filename: "carrier-c4.wav" },
        { referenceMidi: 72, buffer: {} as any, filename: "carrier-c5.wav" },
      ],
    };
    // target 71 is 11 above 60, 1 below 72 => pick 72
    const result = pickCarrier(bank, 71);
    expect(result!.carrier.referenceMidi).toBe(72);
  });

  it("target below all carriers picks the lowest", () => {
    const bank: CarrierBank = {
      carriers: [
        { referenceMidi: 48, buffer: {} as any, filename: "carrier-c3.wav" },
        { referenceMidi: 60, buffer: {} as any, filename: "carrier-c4.wav" },
      ],
    };
    const result = pickCarrier(bank, 20);
    expect(result!.carrier.referenceMidi).toBe(48);
  });

  it("target above all carriers picks the highest", () => {
    const bank: CarrierBank = {
      carriers: [
        { referenceMidi: 48, buffer: {} as any, filename: "carrier-c3.wav" },
        { referenceMidi: 60, buffer: {} as any, filename: "carrier-c4.wav" },
      ],
    };
    const result = pickCarrier(bank, 100);
    expect(result!.carrier.referenceMidi).toBe(60);
  });

  it("computes octave-up rate (2.0) for +12 semitones", () => {
    const bank: CarrierBank = {
      carriers: [{ referenceMidi: 48, buffer: {} as any, filename: "c3.wav" }],
    };
    const result = pickCarrier(bank, 60)!;
    expect(result.rate).toBeCloseTo(2.0, 5);
  });

  it("computes octave-down rate (0.5) for -12 semitones", () => {
    const bank: CarrierBank = {
      carriers: [{ referenceMidi: 72, buffer: {} as any, filename: "c5.wav" }],
    };
    const result = pickCarrier(bank, 60)!;
    expect(result.rate).toBeCloseTo(0.5, 5);
  });

  it("computes perfect-fifth rate for +7 semitones", () => {
    const bank: CarrierBank = {
      carriers: [{ referenceMidi: 60, buffer: {} as any, filename: "c4.wav" }],
    };
    const result = pickCarrier(bank, 67)!;
    expect(result.rate).toBeCloseTo(Math.pow(2, 7 / 12), 5);
  });

  it("single carrier bank always returns that carrier", () => {
    const bank: CarrierBank = {
      carriers: [{ referenceMidi: 60, buffer: {} as any, filename: "c4.wav" }],
    };
    const low = pickCarrier(bank, 30)!;
    const high = pickCarrier(bank, 100)!;
    expect(low.carrier.referenceMidi).toBe(60);
    expect(high.carrier.referenceMidi).toBe(60);
  });
});

// ── defaultCarrierDir ───────────────────────────────────────────────────────

describe("defaultCarrierDir", () => {
  it("returns a string containing 'samples' and 'vocal'", () => {
    const dir = defaultCarrierDir();
    expect(typeof dir).toBe("string");
    expect(dir).toContain("samples");
    expect(dir).toContain("vocal");
  });

  it("returns a non-empty path", () => {
    const dir = defaultCarrierDir();
    expect(dir.length).toBeGreaterThan(0);
  });
});
