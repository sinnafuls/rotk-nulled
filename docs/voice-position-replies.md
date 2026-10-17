# Vivox position responses

The bundled Vivox proxy keeps successful replies for `session_set_3d_position` (request 0x1c). BR1315 registers each accepted request cookie in its native pending map. Its message handler removes that cookie before ignoring a successful position reply. Suppressing the reply leaves pending entries which can prevent native logout and subsequent joins.

The SDK supports no-reply position requests as an optional optimization. That option does not preserve BR1315's request lifecycle. The proxy sets the reply-required disposition and preserves the positions, cookie, original SDK errors and ownership. Source, bundled DLL, sidecar and CI/release pins use the same binary.

The native regression checks writable boundaries, unchanged positions/cookies, unrelated requests and real SDK error replies. A private TEST build with this correction restored logout/rejoin in the captured SDK trace; two players confirmed working voice after landing. Public installer checks remain part of the normal release workflow. No FPS gain is claimed.
