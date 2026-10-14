# Demo video exports

Keep every finished demo in a folder named for its flow, matching the `flowId` in `tsn-demo/flows/<flow-id>.json`:

```text
exports/
  README.md
  tin-creation-wallet-recovery/
    TSN-XP-TIN-Creation-and-Recovery-Devnet.mp4
    working/
      frames/
      segments/
    voiceover/
      takes/
```

The MP4 is the shareable deliverable. `working/` contains reproducible renderer output and can be cleared when disk space matters; the source recording, evidence, flow settings, shared music, and editing notes live in their respective `tsn-demo/source/`, `evidence/<flow-id>/`, `flows/`, and `music/` folders.

When starting a new subject, create its flow JSON and evidence folder first, set the JSON `output` to `../exports/<flow-id>/<descriptive-name>.mp4`, and render with:

```powershell
python .\tsn-demo\render_tin_demo.py --flow .\tsn-demo\flows\<flow-id>.json
```

The root `npm run tsn:demo:render` shortcut rebuilds the short TIN creation-and-recovery section. Future demo subjects should get their own flow JSON, source capture, evidence pack, and export folder before being assembled into the final product demo.

Start the shared local studio with `npm run tsn:demo:voiceover`. It captures narration against the selected flow, cleans the microphone take locally, and saves the voice WAV and mixed MP4 under that flow's `voiceover/takes/` folder. The reusable app lives in `tsn-demo/voiceover-studio/`; its `--flow` argument selects any flow JSON.

For another demo, create `tsn-demo/flows/<flow-id>.json`, render its MP4, and launch the shared studio with `npm run tsn:demo:voiceover:flow -- .\tsn-demo\flows\<flow-id>.json`. Add a `voiceoverScript` path to the flow JSON when you have narration; the studio can still record if the script is not ready.
