# Editing and compiling a TSN demo flow

Edit the flow timeline in [tin-creation-wallet-recovery.json](tin-creation-wallet-recovery.json). Each clip uses seconds from the original recording. `sourceStart` and `sourceEnd` set the in/out points; `speed` controls how quickly that section plays; `scene` selects its evidence panel; `transitionSeconds` sets the crossfade into that clip. Set the first clip transition to `0`. A value such as `0.4` blends the outgoing view into the next view for four tenths of a second.

The output duration is the sum of each clip's `(sourceEnd - sourceStart) / speed`, minus the crossfade durations. For example, a source range from 30 to 70 seconds at 3× takes about 13.3 seconds in the edit. Keep crossfades near 0.3–0.6 seconds so the two flow panels blend without obscuring their labels. Use `0` for a hard cut.

The scene name must match a renderer scene: `hero`, `creation`, `receiver`, `node`, `cranker`, `finality`, or `recovery`. Preserve the source order. In this run, the jump from the creation result to the recovery prompt is the reload; the recovery scene title marks that change for the viewer.

## Rebuild the MP4

From the repository root in PowerShell, install the renderer dependencies once, then compile after editing the JSON:

```powershell
python -m pip install -r .\tsn-demo\requirements-render.txt
python .\tsn-demo\render_tin_demo.py --flow .\tsn-demo\flows\tin-creation-wallet-recovery.json
```

The renderer writes the finished MP4 to the `output` path in the flow JSON. It stores regenerated frames and intermediate clips under that subject's `exports/<flow-id>/working/` folder. Review the MP4 before recording narration; if you change clip times or crossfades, update `evidence/tin-creation-wallet-recovery/voiceover-script.md` to match the new timeline.

## One-command rebuild and music

From the repository root, run `npm run tsn:demo:render` to rebuild this short creation-and-recovery section. The renderer mixes in the instrumental bed from `tsn-demo/music/tsn-regal-drill-bed.wav` at the level set by `musicVolume` (12% by default). Change that to `0` for a silent export or replace the WAV with your FL Studio mix. The renderer fades the bed at the end and does not include narration; record it afterward in the shared Voiceover Studio.

For another flow, duplicate a JSON file in `tsn-demo/flows/`, point `source`, `music`, and `output` at that subject's files, and set `voiceoverOutput` to a descriptive final MP4 path inside that subject's export folder, for example `../exports/<flow-id>/final/TSN-XP-Demo-02-<subject>.mp4`. Then render it with `python .\tsn-demo\render_tin_demo.py --flow .\tsn-demo\flows\<flow-id>.json`. The renderer keeps work files under `exports/<flow-id>/working/`; the Voiceover Studio saves the completed narrated video to `voiceoverOutput` and keeps raw/cleaned takes under `exports/<flow-id>/voiceover/takes/`. Add a matching evidence pack and update its manifest with the rendered MP4 path.

The accompanying FL Studio MIDI sketch and sound-selection notes are in `tsn-demo/music/README.md`.

## Record and master narration

With the demo rendered and the renderer dependencies installed, run `npm run tsn:demo:voiceover` for the current TIN flow. For any other flow, run `python .\tsn-demo\voiceover-studio\server.py --flow .\tsn-demo\flows\<flow-id>.json`. The shared studio opens in your browser with that flow's video and narration script, when provided. Enable the microphone, say a full sentence, and wait for **VOICE LIKELY** before recording; the input meter shows sound level, while the status checks for speech-like energy above the room noise. Pause and resume the recording and picture together when you need a breath or another take. If FFmpeg is missing, install it once with `python -m pip install -r .\tsn-demo\requirements-render.txt`.

Click **Clean take + make video mix** to create a denoised 48 kHz voice WAV and save the final MP4 with narration over the instrumental to the flow's `voiceoverOutput` path. The studio shows that saved path and previews the saved file; it does not trigger a browser download. The music is automatically ducked while you speak and the final mix is peak-limited. Raw takes, cleaned WAVs, and per-take intermediate mixes stay under `exports/<flow-id>/voiceover/takes/`; nothing is uploaded to a hosted service. Use gentle cleanup for a quiet room and standard only when there is more constant fan or room noise. A close mic, headphone monitoring, and a consistent speaking distance still matter most; aggressive denoising can make speech sound metallic.
