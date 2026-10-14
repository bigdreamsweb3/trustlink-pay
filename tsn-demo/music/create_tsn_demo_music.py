"""Create an original TSN demo instrumental bed and a FL Studio-ready MIDI sketch."""

from __future__ import annotations

import math
import random
import struct
import wave
from array import array
from pathlib import Path


HERE = Path(__file__).resolve().parent
SAMPLE_RATE = 22050
BPM = 96
TICKS_PER_BEAT = 480
BEAT_SECONDS = 60 / BPM
BAR_SECONDS = BEAT_SECONDS * 4
BARS = 24
DURATION = BAR_SECONDS * BARS
GAIN = 0.56

# D minor tonal center: sparse, cold harmonic movement for a technical dark-trap bed.
CHORDS = [
    ("D minor", (50, 57, 62), 38),
    ("Bb5", (46, 53, 58), 34),
    ("F5", (41, 48, 53), 29),
    ("C5", (48, 55, 60), 36),
]


def midi_vlq(value: int) -> bytes:
    buffer = value & 0x7F
    out = bytearray()
    while (value := value >> 7):
        buffer <<= 8
        buffer |= ((value & 0x7F) | 0x80)
    while True:
        out.append(buffer & 0xFF)
        if buffer & 0x80:
            buffer >>= 8
        else:
            break
    return bytes(out)


def midi_track(events: list[tuple[int, bytes]], name: str | None = None) -> bytes:
    if name:
        events.append((0, b"\xff\x03" + bytes([len(name)]) + name.encode()))
    events.sort(key=lambda event: event[0])
    data = bytearray()
    last_tick = 0
    for tick, payload in events:
        data.extend(midi_vlq(max(0, tick - last_tick)))
        data.extend(payload)
        last_tick = tick
    data.extend(b"\x00\xff\x2f\x00")
    return b"MTrk" + struct.pack(">I", len(data)) + data


def note_events(events: list[tuple[int, bytes]], channel: int, pitch: int, start_beat: float,
                length_beats: float, velocity: int) -> None:
    on = round(start_beat * TICKS_PER_BEAT)
    off = round((start_beat + length_beats) * TICKS_PER_BEAT)
    events.extend([(on, bytes([0x90 | channel, pitch, velocity])),
                   (off, bytes([0x80 | channel, pitch, 0]))])


def make_midi() -> None:
    tempo = round(60_000_000 / BPM)
    meta = [(0, b"\xff\x51\x03" + tempo.to_bytes(3, "big")),
            (0, b"\xff\x58\x04\x04\x02\x18\x08")]
    tracks = [midi_track(meta, "TSN Demo | 96 BPM | D minor")]
    keys: list[tuple[int, bytes]] = [(0, bytes([0xC0, 81]))]  # Saw lead
    strings: list[tuple[int, bytes]] = [(0, bytes([0xC1, 89]))]  # Warm pad
    bass: list[tuple[int, bytes]] = [(0, bytes([0xC2, 38]))]  # Synth bass
    pluck: list[tuple[int, bytes]] = [(0, bytes([0xC3, 10]))]  # Music box / metallic pluck
    drums: list[tuple[int, bytes]] = []
    for bar in range(BARS):
        name, chord, root = CHORDS[bar % len(CHORDS)]
        beat = bar * 4
        # A two-note, minor-second synth signal creates a sparse, encrypted-console pulse.
        pattern = (chord[0] + 12, chord[0] + 13, chord[2] + 12, chord[0] + 13,
                   chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 13)
        for step, pitch in enumerate(pattern):
            if step not in (3, 7) or bar % 2 == 1:
                note_events(keys, 0, pitch, beat + step * 0.5, 0.19, 67 if step in (0, 4) else 48)
        # Short, low-register pad swells replace the sustained hymn-like chords.
        note_events(strings, 1, chord[0], beat, 1.8, 32)
        # Metallic plucks mark each two-bar boundary like a digital status ping.
        if bar % 2 == 0:
            note_events(pluck, 3, chord[2] + 24, beat + 3.5, 0.12, 53)
        # Restrained drill bounce: downbeat plus two syncopated low notes.
        for offset, length, velocity in ((0, 0.9, 96), (1.5, 0.42, 77), (3.25, 0.5, 85)):
            note_events(bass, 2, root, beat + offset, length, velocity)
        # Kick, half-time snare/clap, and crisp hats; brief triplet roll every fourth bar.
        for offset in (0, 1.5, 3.25):
            note_events(drums, 9, 36, beat + offset, 0.12, 91 if offset == 0 else 72)
        note_events(drums, 9, 38, beat + 2, 0.12, 78)
        note_events(drums, 9, 39, beat + 2, 0.12, 34)
        for step in range(8):
            note_events(drums, 9, 42, beat + step * 0.5, 0.08, 43 if step % 2 == 0 else 31)
        if bar % 4 == 3:
            for step in range(6):
                note_events(drums, 9, 42, beat + 3 + step / 6, 0.05, 35)
    tracks.extend([midi_track(keys, "Cold saw | minor-second signal"),
                   midi_track(strings, "Low synth pad | short swells"),
                   midi_track(pluck, "Metallic digital pings"),
                   midi_track(bass, "808 | syncopated low end"),
                   midi_track(drums, "Drums | half-time drill pocket")])
    header = b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), TICKS_PER_BEAT)
    (HERE / "tsn-regal-drill-sketch.mid").write_bytes(header + b"".join(tracks))


def add_tone(mix: array, pitch: int, start: float, length: float, kind: str, velocity: float,
             pan: float = 0.0, seed: int = 0) -> None:
    start_i = max(0, round(start * SAMPLE_RATE))
    count = min(round(length * SAMPLE_RATE), len(mix) - start_i)
    if count <= 0:
        return
    frequency = 440 * (2 ** ((pitch - 69) / 12))
    rng = random.Random(seed)
    phase = 0.0
    left_gain = (1 - pan) * 0.5
    right_gain = (1 + pan) * 0.5
    for i in range(count):
        t = i / SAMPLE_RATE
        if kind == "piano":
            env = min(1, t / 0.012) * math.exp(-3.4 * t / max(length, 0.1))
            value = (math.sin(phase) + 0.34 * math.sin(phase * 2.01) +
                     0.13 * math.sin(phase * 3.98)) * env
        elif kind == "pulse":
            env = min(1, t / 0.006) * math.exp(-7.0 * t / max(length, 0.08))
            value = (math.sin(phase) + 0.27 * math.sin(phase * 2.03) +
                     0.08 * math.sin(phase * 3.97)) * env
        elif kind == "pad":
            env = min(1, t / 0.2) * min(1, max(0, (length - t) / 0.25))
            value = (math.sin(phase) + 0.16 * math.sin(phase * 2.01)) * env
        elif kind == "metal":
            env = math.exp(-9 * t / max(length, 0.08))
            value = (math.sin(phase) + 0.52 * math.sin(phase * 2.71) +
                     0.31 * math.sin(phase * 4.16)) * env
        elif kind == "strings":
            fade_in = min(1, t / 0.32)
            release = min(1, max(0, (length - t) / 0.3))
            vibrato = 1 + 0.002 * math.sin(2 * math.pi * 5.1 * t)
            phase += 2 * math.pi * frequency * vibrato / SAMPLE_RATE
            value = (math.sin(phase) + 0.32 * math.sin(phase * 2) +
                     0.12 * math.sin(phase * 3)) * fade_in * release
            mix[2 * (start_i + i)] += value * velocity * left_gain * 0.16
            mix[2 * (start_i + i) + 1] += value * velocity * right_gain * 0.16
            continue
        elif kind == "808":
            sweep = max(0.58, 1 - t * 0.62)
            phase += 2 * math.pi * frequency * sweep / SAMPLE_RATE
            env = min(1, t / 0.008) * math.exp(-2.8 * t / max(length, 0.15))
            raw = math.sin(phase) + 0.22 * math.sin(2 * phase)
            value = math.tanh(raw * 1.7) * env
        elif kind == "kick":
            f = 95 * math.exp(-t * 15) + 38
            phase += 2 * math.pi * f / SAMPLE_RATE
            value = math.sin(phase) * math.exp(-t * 18)
        elif kind == "snare":
            noise = rng.uniform(-1, 1)
            value = (0.7 * noise + 0.3 * math.sin(2 * math.pi * 185 * t)) * math.exp(-t * 28)
        elif kind == "hat":
            value = rng.uniform(-1, 1) * math.exp(-t * 75)
        else:
            value = 0
        if kind in ("piano", "pulse", "pad", "metal", "kick", "snare", "hat"):
            phase += 2 * math.pi * frequency / SAMPLE_RATE
        value *= velocity
        mix[2 * (start_i + i)] += value * left_gain
        mix[2 * (start_i + i) + 1] += value * right_gain


def make_audio() -> None:
    total = round((DURATION + 1) * SAMPLE_RATE)
    mix = array("f", [0.0]) * (total * 2)
    for bar in range(BARS):
        _, chord, root = CHORDS[bar % len(CHORDS)]
        beat = bar * 4
        pattern = (chord[0] + 12, chord[0] + 13, chord[2] + 12, chord[0] + 13,
                   chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 13)
        for step, pitch in enumerate(pattern):
            if step not in (3, 7) or bar % 2 == 1:
                add_tone(mix, pitch, (beat + step * 0.5) * BEAT_SECONDS, 0.23,
                         "pulse", 0.095 if step in (0, 4) else 0.06,
                         -0.22 if step % 2 == 0 else 0.22)
        add_tone(mix, chord[0], beat * BEAT_SECONDS, 1.15, "pad", 0.34, 0.0)
        if bar % 2 == 0:
            add_tone(mix, chord[2] + 24, (beat + 3.5) * BEAT_SECONDS,
                     0.48, "metal", 0.10, 0.0, bar)
        for index, (offset, length, velocity) in enumerate(((0, 0.85, 0.8), (1.5, 0.42, 0.58), (3.25, 0.5, 0.68))):
            at = (beat + offset) * BEAT_SECONDS
            add_tone(mix, root, at, length * BEAT_SECONDS, "808", velocity, 0.0, bar * 8 + index)
            add_tone(mix, 36, at, 0.22, "kick", 0.30 if offset == 0 else 0.22, 0.0, bar * 4 + index)
        add_tone(mix, 38, (beat + 2) * BEAT_SECONDS, 0.20, "snare", 0.16, 0.0, bar)
        for step in range(8):
            at = (beat + step * 0.5) * BEAT_SECONDS
            add_tone(mix, 42, at, 0.055, "hat", 0.065 if step % 2 == 0 else 0.043,
                     0.12 if step % 2 == 0 else -0.12, bar * 16 + step)
        if bar % 4 == 3:
            for step in range(6):
                at = (beat + 3 + step / 6) * BEAT_SECONDS
                add_tone(mix, 42, at, 0.04, "hat", 0.045, 0.0, bar * 16 + 12 + step)
    fade_n = round(1.5 * SAMPLE_RATE)
    for i in range(total):
        t = i / SAMPLE_RATE
        fade = min(1.0, max(0.0, (DURATION - t) / (fade_n / SAMPLE_RATE)))
        for channel in range(2):
            index = 2 * i + channel
            sample = max(-0.92, min(0.92, mix[index] * GAIN * fade))
            mix[index] = sample
    pcm = array("h", (int(value * 32767) for value in mix))
    if pcm.itemsize != 2:
        raise RuntimeError("Expected 16-bit PCM output")
    with wave.open(str(HERE / "tsn-regal-drill-bed.wav"), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm.tobytes())


if __name__ == "__main__":
    make_midi()
    make_audio()
    print(f"Created original TSN music at {BPM} BPM, {DURATION:.1f} seconds")
