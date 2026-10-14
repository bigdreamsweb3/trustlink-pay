# TSN XP Voiceover Studio

The studio is shared across demo subjects. Run the current TIN flow from the repository root:

```powershell
npm run tsn:demo:voiceover
```

The script opens `http://127.0.0.1:8766` in your browser. Keep its terminal open while recording and press **Ctrl+C** when finished. It needs the demo MP4 rendered first and FFmpeg available through PATH or the Python `imageio-ffmpeg` package.

For another demo, render its flow and select its JSON directly:

```powershell
python .\tsn-demo\voiceover-studio\server.py --flow .\tsn-demo\flows\<flow-id>.json
```

Or use the root package shortcut:

```powershell
npm run tsn:demo:voiceover:flow -- .\tsn-demo\flows\<flow-id>.json
```

The flow JSON points to its MP4 and may include a `voiceoverScript` path. Without a script, the studio still records and masters a take. It writes the raw take, cleaned WAV, and mixed MP4 to `tsn-demo/exports/<flow-id>/voiceover/takes/`.

Install the shared render/audio dependency once if needed:

```powershell
python -m pip install -r .\tsn-demo\requirements-render.txt
```

## Recording

1. Connect headphones, select the physical microphone, and click **Enable microphone**. Allow microphone access for the local page. If Windows has a virtual input such as **WO Mic Device**, choose the actual PC microphone (often **High Definition Audio Device**) instead. Changing the input selector reconnects the live meter to that device.
2. Say a complete sentence at narration volume. The bar shows input level; only **VOICE LIKELY** means speech-like sound rose above the room-noise floor. **NOISE / WAITING FOR VOICE** means the device is active but the meter cannot distinguish speech from background sound. **NO INPUT** suggests a muted, disconnected, or incorrectly selected device; **TOO HOT** means the signal may clip.
3. Click **Record take**. The video plays silently while you read the on-screen script. Use **Pause** to pause the mic and video together; click **Stop** at the end.
4. Listen to your raw performance if needed, choose gentle cleanup for a quiet room or standard for a steady fan/room-noise floor, then click **Clean take + make video mix**.
5. Preview and download the cleaned voice WAV or finished voiceover MP4. The original music-only demo remains untouched.

The master uses a high-pass filter, FFT denoising, compression, -18 LUFS voice normalization, music ducking, and a final true-peak limiter. It is a practical narration master for this demo, not a substitute for a treated room; clipping, keyboard clicks, traffic, and heavy echo are best fixed at the microphone.

Raw recordings and exports remain on this computer in the selected flow's `voiceover/takes/` folder. The HTTP server binds to loopback (`127.0.0.1`) and does not upload audio to a remote service.
