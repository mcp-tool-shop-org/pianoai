import { describe, it, expect } from "vitest";
import { filenameToMidi, pickCarrier } from "./vocal-carriers.js";

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
});
