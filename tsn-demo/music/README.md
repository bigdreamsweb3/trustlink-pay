# TSN demo music

`tsn-regal-drill-bed.wav` is an original instrumental bed composed for TSN demo videos. The arrangement is in D minor at 96 BPM and runs for about one minute. It uses a sparse detuned synth pulse, low synthetic drone, short metallic digital pings, syncopated 808, half-time kick/snare, and tight hi-hats. There are no choir, organ, or orchestral chord layers.

The MP4 renderer mixes this bed at 75% volume (about −2.5 dB) and fades it out at the end. This makes the instrumental audible on phone and laptop speakers while leaving room for narration. The voiceover studio ducks it under speech and mixes the narration at full level. The source recording audio is not used by the renderer. Adjust `musicVolume` in the flow JSON to change the level; `0` renders without music.

## FL Studio sound choices

Import `tsn-regal-drill-sketch.mid` and route its tracks to your preferred plugins. For the deep-crypto sound, try a short, slightly detuned analog saw or wavetable pulse; a low filtered synth drone; and a metallic FM/pluck ping with a quick decay. For the drill groove, use a clean gliding 808, a tight kick, a dry clap/snare on the half-time backbeat, and a closed hat with short triplet rolls at bar endings. Keep the synth attack precise and the reverb short; avoid choir, organ, long orchestral strings, and bright major-key chords.

The MIDI and WAV are an original TSN composition, not samples from a commercial song. Use the WAV as the ready-to-go demo bed or replace it with your FL Studio export at the same path to have the renderer pick up your mix.

## Recreate or customize

Run `python .\tsn-demo\music\create_tsn_demo_music.py` from the repository root to regenerate the WAV and MIDI. The source is standard-library Python; no extra music package is required.
