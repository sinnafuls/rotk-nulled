# Voice recovery candidate 2.0.37

Four fast HTTP 409 responses used to end recovery after about 3.5 seconds and
leave the same login or room blocked. The worker now retries within the existing
20-second deadline, caps backoff at four seconds, and permits another application
request after a transient episode and a five-second cooldown. A longer
Retry-After remains authoritative across episodes. A pending or successful
request still rejects duplicates. HTTP 403, malformed grants, wrong accounts and
wrong channels remain refused; no old-token fallback is introduced.

Login and room cooldowns belong to their original context. Cancellation and
new generations cannot reactivate an old room. Internal media retries retain
the existing removal requirement, ten-second delay and two-episode limit.
Device selection, PTT and audio transmission are unchanged.

Expiry while queued, expiry before SDK polling and expiry of a previously valid
grant permit a fresh request after cooldown. A late 403 or malformed response
remains a permanent refusal. Both join ABIs share the same pending-room guard.
Queue or allocation pressure when scheduling a media rejoin preserves its desire
and retry budget; a replaced generation cannot be reactivated by that failure.
SDK responses with no request owned by the proxy remain visible to the game.

`recovery` log lines describe terminal failures and cooldowns without tokens,
identities or private room URIs. HTTP User-Agent is `ROTK-VivoxProxy/2.0.37`.

HTTP 500/502/504 now retry within the same deadline. A premature response-body
EOF with a declared Content-Length is distinguished from an invalid grant:
transport interruption retries, malformed or oversized payloads remain refused.
The original WinHTTP error is captured before querying Retry-After.

Documented SDK network/timeouts permit a fresh-grant application retry after
cooldown. Invalid arguments, bad signatures and other authorization errors remain
blocked. This includes VAT service-unavailable 20127; retry does not repair an
outage of that service. Internal media recovery retains the removal condition,
ten-second delay, two-episode limit and existing mute/volume restoration. SDK
failure logs contain request type, numeric status and the recovery decision.
Classification reference: [Vivox SDK error codes](https://docs.vivox.com/v5/general/core/5_19_0/en-us/Core/developer-guide/troubleshooting/error-codes.htm).

Run `npm run test:native:duo-voice`: existing SDK/HTTP/ownership regressions and
34 login/join cases cover four quick 409s followed by success, cooldown
and same-context retry with Retry-After 60, 500/502/504, truncated HTTP 200,
malformed HTTP 200, immediate and asynchronous SDK network failures, SDK VAT service unavailable, and
continued refusal after HTTP 403 or SDK invalid signature. Extra cases cover
queue/poll/grant expiry and delayed permanent refusals, plus four real-SDK
pressure/unowned-response/generation regressions.
The test advances cooldown deadlines directly to avoid waiting a full minute;
the HTTP recovery itself uses the real WinHTTP worker and SDK allocator.

Before publication, qualify a real pair of accounts across three games,
menu/lobby transitions, proximity/team voice, PTT/mute, network loss and device
changes. Update the private integrity policy for the candidate proxy hash and
admit 2.0.37 before exposing its update. No asset payload changes are required.
Require the corrected Nginx provisioning and its release preflight described
in the server's `infra/rust/README.md`; it can be reloaded without a game restart.
