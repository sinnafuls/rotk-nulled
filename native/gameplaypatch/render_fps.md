# Rendered frame counter

The FPS HUD previously counted Scaleform timer callbacks, which saturate around
300/s independently of the game's rendering rate. This module counts successful
DXGI `Present` calls for the game's main swap chain instead. Test presentations,
occlusion, failures, small helper windows and secondary chains are excluded.
The normal path adds one QPC read and one short lock per presentation; window
validation runs only when an unfamiliar swap chain appears.

The existing guarded gameplay DLL installs the counter after the supported v26
executable has unpacked. It atomically exchanges the shared DXGI Present pointer
and reuses the existing thread-suspension gate to redirect the native options
binding. Installation refuses a thread inside the old prologue. The copied prologue
has registered x64 unwind metadata. Stock option reads continue through the
original function; only `ROTKRuntime/RenderedFramesV1` uses the native counter.
The existing movie string constructor returns the sample, without configuration
writes, disk sampling, a helper process or networking.

The read-only response is `1,generation,frames,qpc,qpcFrequency`. The HUD computes
the delta every 250 ms using the native clock. A replaced chain starts a new
generation; a chain that has not presented for a second is unavailable. Removing
the gameplay marker disables both hooks' custom behavior. Their code remains
resident until process exit, as with the existing stance hook.

Build with `build-gameplay-patch.ps1`. `test-dinput8-proxy.ps1` runs the existing
gameplay checks plus native frame-count/ABI tests. `verify-gameplay-patch.mjs`
checks the rebuilt DLL against the packaged digest, exports and mitigations.
The optional `ROTK_FPS_DIAGNOSTIC` build records its first 40 HUD reads and the
independent `GetLastPresentCount` reference; packaged builds omit this logging.

Native preview validation: the hook loaded without a crash, and 11 measured
menu intervals matched the independent DXGI presentation-count delta exactly.
The user confirmed the corrected HUD in Combat Training; 11 subsequent samples
measured 391–460 FPS and all matched the DXGI reference delta exactly.
The native unit test counts 1,200 frames and checks exclusions, replacement,
managed GFx strings, stale samples and stock-binding fallback. The native getter
bridge also forwards 10,000 synthetic x64 calls and has valid unwind registration.
The paired assets
test covers 400, 500 and 1,000 FPS, 250 ms drops and ON/OFF. Resolution changes,
spectator transitions and third-party overlays were not manually tested.

Deploy with the paired assets HUD update. The updated packaged DLL digest must
follow the normal launcher/server patch-attestation release process; these source
changes do not change a public release or production policy.
