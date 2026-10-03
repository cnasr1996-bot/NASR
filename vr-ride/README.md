# NASR VR Ride — 4D VR motion experience

Riders wear VR headsets on motion chairs. The chair moves, the seat vibrates, fans blow and water sprays, all in sync with the 360° / 3D video playing in the headset.

```
 ┌──────────── VR headset (per seat) ─────────────┐        ┌──────── Ride PC (this server) ────────┐
 │ WebXR player in the headset browser             │  Wi-Fi │ Engine (60 Hz)                         │
 │  • 360° / 180° / flat · mono or 3D stereo video │◀──────▶│  video time → effects timeline         │
 │  • reports video time 10×/s  (master clock)     │  WSS   │  → safety (limits, rate, water guard)  │──▶ chair (UDP / serial)
 │  • motion compensation, recenter, lobby screen  │        │  → drivers                             │──▶ fans  (relay / dimmer)
 │  • headset on/off detection                     │        │                                        │──▶ water (relay + auto-off)
 └─────────────────────────────────────────────────┘        │ Operator dashboard (any browser)       │
                                                             └────────────────────────────────────────┘
```

**Why the headset is the clock:** the video in the headset is what the rider sees. Each chair follows its own headset's playback time. If a headset buffers or starts late, its chair waits for it instead of drifting out of sync.

## Quick start (no hardware needed)

```bash
cd vr-ride
npm install
npm start
```

- Operator dashboard: `http://localhost:8080/operator/`
- Headset player: the dashboard lists the headset links (`https://<pc-ip>:8443/headset/?seat=1`).
- On a PC, open the headset link and press **2D preview** to look around with the mouse. Load **Demo: Light Tunnel** in the dashboard and press **Start**. You'll see the chair values move live. The demo needs no video file.
- `npm test` runs the engine, safety, timeline and driver tests.

## Headset side

### Supported headsets

The player is a WebXR web app, so the same build runs on any headset with a WebXR browser. You don't install an app on each headset.

| Headset | Browser | Notes |
|---|---|---|
| Meta Quest 2 / 3 / 3S / Pro | Meta Quest Browser | Recommended. Shows the system "Enter VR" prompt automatically. |
| Pico 4 / 4 Ultra / Neo 3 | Pico Browser | Works the same way. |
| Apple Vision Pro | Safari (visionOS 2+) | WebXR is on by default in visionOS 2. |
| PC VR (Index, Vive, Quest via Link) | Chrome / Edge + SteamVR or Oculus | Good for 8K content that's too heavy for standalone headsets. |

### What the player does

- **Video formats** (`video.format` in `experience.json`):
  - `360-mono`, `360-tb`, `360-sbs`: full sphere, 2D or 3D (top/bottom or side-by-side, left eye first)
  - `180-sbs`, `180-tb`: VR180 3D
  - `flat`, `flat-sbs`, `flat-tb`: cinema screen, 2D or 3D movie
- **Stays in VR between riders.** The headset shows a bilingual waiting screen (English/Arabic). The operator loads and starts every show from the dashboard, so staff never touch the headset between rides.
- **Motion compensation.** When the chair tilts, the headset's tracking sees the rider's head tilt too. Without compensation the horizon in the video would tilt the wrong way. The server streams the chair's actual pose to the headset (30 Hz), and the player rotates the video with the chair, so the world stays fixed to the seat the way it would in a real vehicle. Turn it off with `headset.motionCompensation: false`.
- **Recenter.** Each show starts with the video's front where the rider is looking (`headset.recenterOnStart`). Staff can also recenter any seat from the dashboard.
- **Headset removed.** The proximity sensor ends the XR session's visibility. The server parks that chair and the dashboard shows "headset off head". The chair moves again when the headset goes back on.
- **Buffering.** While the video is stalled, the headset reports "not playing", so the chair holds still instead of running ahead of a frozen picture.
- **Connection lost.** If the headset goes silent for more than 1.5 s (Wi-Fi, battery, crash), its chair parks and its fans and water stop.
- **Battery.** The battery level is shown on the dashboard where the browser exposes it.
- **E-stop.** The video stops and a red "Ride paused, please stay seated" screen appears in the headset.

### Setting up a headset (Meta Quest)

1. Connect the headset to the **same Wi-Fi as the ride PC**. Use a dedicated Wi-Fi 6/6E router for the ride and keep guests off it.
2. Open **Meta Quest Browser** → `https://<pc-ip>:8443/headset/?seat=1` (the dashboard lists the exact links).
3. The first time, the browser warns about the certificate. Choose **Advanced → Proceed**. WebXR only works over HTTPS, so the server makes its own certificate for your local network. You accept it once per headset.
4. Bookmark the page. Press **Enter VR** once (or accept the system prompt). The headset now stays in VR and waits for shows.
5. Turn off the Guardian/boundary for seated use: *Settings → Developer → Boundary* (needs developer mode), or set a small stationary boundary.
6. Kiosk mode (recommended): use **Meta Horizon Managed Solutions** (Quest for Business) to lock the headset to the browser and your bookmark. Riders then can't leave the ride page.
7. Set the display timeout to the maximum so the headset doesn't sleep between riders.

Each headset needs its own seat number (`?seat=1`, `?seat=2`…). You can also change the seat from the drop-down on the page.

### Video tips

- Standalone headsets decode up to about **5.7K 360° (5760×2880) at 30–60 fps H.264/H.265** smoothly. 8K needs PC VR.
- Encode with `-movflags +faststart` so playback starts before the whole file has downloaded:
  ```bash
  ffmpeg -i ride.mov -c:v libx265 -tag:v hvc1 -crf 20 -preset slow -c:a aac -b:a 192k -movflags +faststart video.mp4
  ```
- The headset buffers the whole video before it reports "ready". Large files on weak Wi-Fi take longer to load, and the dashboard shows the loading state.

## Content: creating an experience

Each experience is a folder in `content/`:

```
content/
  roller-coaster/
    experience.json
    video.mp4
```

```json
{
  "title": { "en": "Desert Roller Coaster", "ar": "أفعوانية الصحراء" },
  "duration": 185,
  "video": { "src": "video.mp4", "format": "360-mono" },
  "effects": {
    "pitch":  [[0, 0], [12.0, 10], [14.5, -12, "linear"], [16, 0]],
    "roll":   [[20, 0], [21.5, 12], [24, -12], [25, 0]],
    "heave":  [[30, 0], [30.2, 30, "linear"], [30.4, -30, "linear"], [30.8, 0]],
    "vibration":   [[0, 0.2], [30, 1, "step"], [31, 0.2]],
    "vibrationHz": [[0, 30], [30, 60]],
    "fan":   [[0, 0.3], [12, 1], [40, 0.4]],
    "water": [[62.5, 0.6], [101, 1.0]]
  }
}
```

| Track | Unit | Meaning |
|---|---|---|
| `pitch` | degrees | + nose up (rider leans back) |
| `roll` | degrees | + right side down |
| `yaw` | degrees | + turn right |
| `heave` / `surge` / `sway` | mm | + up / forward / right |
| `vibration` | 0–1 | seat shaker strength |
| `vibrationHz` | Hz | shaker frequency |
| `fan` | 0–1 | wind (on/off relay fans switch on above 0.5) |
| `water` | `[start, seconds]` | spray bursts |

A keyframe is `[time, value, ease]`. The ease is how the chair arrives at that keyframe: `smooth` (the default), `linear`, or `step`. Any track you leave out stays neutral. Press **↻ Library** on the dashboard after adding or editing content. Mistakes, like a missing video, keyframes out of order or an unknown track name, are listed next to the experience.

**Tips:** keep motion small and mostly match what the camera does. Accelerating forward feels like `pitch` up plus `surge` back. Use short `heave` bumps with `vibration` for rough road. Put a fan ramp under every speed-up. Water works best as a short surprise.

## Hardware: connecting your chair, fans and sprinklers

All hardware is set in `config/local.json` (copy the parts you need from `config/default.json`; `local.json` overrides it and is not committed).

### Motion chair

The server sends one line per tick (60 Hz) using the `format` template. The template accepts these placeholders:

- `{pitch} {roll} {yaw} {heave} {surge} {sway} {vibration} {vibrationHz}`: scaled to `outputRange` (for example 0–255) from the `limits` envelope
- `{raw_pitch}` etc.: real degrees / mm

```json
{
  "seats": [
    { "id": "1", "name": "Seat 1",
      "chair": { "driver": "udp", "host": "192.168.1.60", "port": 4123,
                 "format": "P{pitch}R{roll}H{heave}V{vibration}\n", "outputRange": [0, 255] } },
    { "id": "2", "name": "Seat 2",
      "chair": { "driver": "serial", "path": "COM4", "baudRate": 115200,
                 "format": "<{pitch},{roll},{heave}>\n", "outputRange": [0, 1023] } }
  ]
}
```

- **Chair has its own motion software** (most commercial chairs: DOF Reality, Motion Systems, Simworx, Chinese 9D/VR chair kits): point **FlyPT Mover** or **SimTools** at UDP from this server. They handle the chair's kinematics and controller.
- **Arduino / ESP32 / SMC3 controller:** use `serial` or `udp` with whatever line format its firmware reads.
- **Proprietary protocol:** send me the chair model or the controller's protocol document and I'll add a driver for it.

### Fans and water

```json
{
  "outputs": [
    { "id": "fan-front",   "kind": "fan",   "driver": "http", "host": "192.168.1.70", "relay": 0, "seats": ["1", "2"] },
    { "id": "water-front", "kind": "water", "driver": "http", "host": "192.168.1.71", "relay": 0, "seats": ["1", "2"] },
    { "id": "fan-pwm",     "kind": "fan",   "driver": "udp",  "host": "192.168.1.72", "port": 5000, "format": "FAN{pct}\n" }
  ]
}
```

- The `http` driver defaults to **Shelly** relays (`/relay/0?turn=on`). For water it adds `&timer=2`, so the Shelly closes the valve by itself if the PC ever crashes while spraying. Tasmota and ESP boards work too through a custom `format` URL.
- Use **12/24 V normally-closed solenoid valves** for water, so the valve fails closed when power drops. Switch fans with contactors or SSRs rated for the motor. Use a PWM/0–10 V controller if you want variable speed.
- `seats` says which riders' shows drive the output. A shared fan follows all of them.

### Safety (read this)

The software keeps every axis inside its `limits` (min/max and max speed). It parks chairs smoothly on E-stop, lost headset, headset removed or show end, and limits water (`maxOnMs` per burst, `minOffMs` gap, `maxPerShowMs` per show). On Ctrl+C the server parks everything before exiting.

**That is not a substitute for hardware safety.** You also need:

- a **hardwired emergency-stop button** that cuts chair power, reachable by the operator
- seat belts or lap bars, and the chair's own end-stops and overload protection
- water valves and wiring rated for wet areas, on an RCD/GFCI protected circuit
- set `limits` to what your chair maker allows, and test every new experience with an empty chair first (**Test chair** on the dashboard)

Set `server.operatorPin` and open the dashboard as `/operator/?pin=1234` so other devices on the network can't control the chairs.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `engine.tickHz` | 60 | Chair update rate |
| `engine.leadMs` | 60 | Motion runs this far ahead of the picture to cover actuator lag. Tune per chair. |
| `engine.headsetTimeoutMs` | 1500 | Park the chair if the headset goes silent this long |
| `engine.parkWhenHeadsetRemoved` | true | Park the chair when the headset is taken off |
| `headset.motionCompensation` | true | Keep the video fixed to the seat while the chair moves |
| `headset.recenterOnStart` | true | Each show starts facing where the rider looks |
| `headset.framebufferScale` | 1.2 | Render resolution. Higher is sharper video, lower is smoother framerate. |
| `headset.foveation` | 0.3 | 0 is sharp edges, 1 is the most GPU savings |
| `limits.<axis>` | | `min`, `max`, `maxRate` (units per second) |
| `water.*` | | Water burst limits (see Safety) |

## Project layout

```
src/
  engine.js      show state, per-seat sync, parking rules, outputs
  timeline.js    keyframe tracks → channel values at time t
  safety.js      motion envelope + rate limiter, water guard
  clock.js       headset playback clock with extrapolation
  library.js     loads content/*/experience.json
  drivers/       chair + fan/water drivers (udp, serial, http, mock)
  server.js      HTTP + HTTPS (self-signed for WebXR), video streaming, WebSockets
public/
  headset/       WebXR player (three.js)
  operator/      dashboard
content/         experiences
test/            node --test
```
