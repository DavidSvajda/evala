# Account experience — Evala 2.2.6

The authenticated header previously waited for the entire remote library download.
Configuration/session requests now start together and confirmed identity renders
before library loading. The initial header is neutral and then explicitly shows
verification; an unavailable account service does not masquerade as a confirmed
sign-out. Changed game downloads use at most four concurrent requests. Existing
account/generation checks still reject responses belonging to another identity.

Account preferences now include validated analysis settings (engine, depth, time,
hash, lines, arrows, profile), report selection/options and the last original-game
position/orientation. Existing board appearance, language, sound, player link,
training preferences, games, analyses, game/position notes and practice data remain
associated with the account. API tokens, server addresses and device-specific
connection settings are excluded from portable analysis preferences.

Preference saves send field patches instead of whole stale snapshots. A local
outbox scoped to account ID and generation retains failed changes across reloads.
Acknowledgement removes only fields that have not changed during the request.
Nested analysis fields merge independently; completion of the same daily lesson
merges completed items. The app retries on reconnection, account initialization and
foreground restoration. Hiding/leaving the app also attempts a bounded keepalive
save. This is eventual synchronization; simultaneous edits of the same field still
follow successful server write order. Pending offline data must reach the server
before another device can receive it.

Manual Sync and explicit note/practice saves may upload partial reviews; normal
analysis progress remains local until completion to avoid uploading on every
position. This does not add background engine execution after closing the app.

Sound defaults to enabled, including a one-time migration of legacy sound settings.
Subsequent explicit mute is persisted and synchronized. One reusable Web Audio
context unlocks on interaction and recovers from suspended/interrupted states.
Move navigation and legal board moves share the sound; browsers/device policies
may still require a user gesture. Sources: [Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).

Previous/next controls are 44px targets on the left; start/end jumps sit separately
on the right, with the position label between them. Auxiliary tools have their own
row. Desktop and 390px mobile views were inspected once.

Scoped verification: three preference checks, seven account checks, the existing
storage identity/race check, and one disposable two-device browser flow. The flow
holds session/library requests separately, verifies default sound and mute,
transfers settings/notes/cursor, retries failed changes across reloads and checks
44px separated navigation without running the engine. Production deployment keeps
the native container smoke. No full release suite or real-user mutation was used.
