# ROTK launcher privacy fork

A Windows fork of [ROTK Launcher](https://github.com/MzKaxD/rotk-launcher), tracking upstream version 2.0.41. This is a community project, unaffiliated with Daybreak Game Company or the ROTK team.

## Privacy and admission

- The launcher does not collect hardware fingerprints or create TPM proofs. It does not substitute synthetic hardware IDs, software keys presented as TPM keys, or fabricated attestations.
- Account authentication, game-file integrity verification, and server admission rules remain authoritative. Missing identity evidence can cause the server to refuse launch. This fork does not promise that identity omission is accepted.
- The real upstream `rotkc.dll` is staged for normal loading by the game runtime. There is no anticheat-disable switch.
- **Launcher privacy is not anticheat privacy.** The anticheat runs independently inside the game and may collect or transmit hardware or system information. This fork does not alter its reports or guarantee what it sends.
- Game launch telemetry remains directed to loopback and launcher-created game logs use anonymous paths. This does not suppress account authentication, integrity requests, opt-in diagnostics, or the anticheat's own networking.
- The installer is per-user and unsigned. No signature or server endorsement is implied.

## Installation

Download a verified installer and its `SHA256SUMS.txt` from [Releases](https://github.com/sinnafuls/rotk-nulled/releases). Match the checksum before installation. A version tag alone is not evidence that its build succeeded.

You need a legitimate game installation and ROTK account key. Game files are not distributed here. Do not install the game inside the launcher's installation directory: launcher replacement or removal can delete that directory. Destination validation also checks the physical path rather than trusting junction aliases.

Server policy determines whether a session without launcher hardware/TPM evidence can launch. A refusal must be shown to the user; it must not be replaced with a successful proof or hidden behind a launcher-version spoof.

## Maintenance

See [MAINTAINING.md](MAINTAINING.md) for the update, verification, and release process. Do not restore historical synthetic-identity or anticheat-disable behavior during an upstream merge.

## License

GPL-3.0-or-later, inherited from upstream. Third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
