# SIA Cryptographic Conformance Vectors

Interop material for the signing rules in [Core Specification §6](../../03_Core-Specification.md): every published signed example carries a **real, verifiable signature** produced with the test keys in [`test-keys.json`](./test-keys.json).

> **TEST KEYS ONLY.** The keys are published — including private halves — so you can test both your signing and your verification code. They carry no authority anywhere. Production keys come from your HSM and PKI.

## Signing rule (recap)

1. Take the artifact and remove the `signature` member from its evidence block (`attestation`, `integrity`, or `evidence`).
2. Serialize with [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785).
3. Sign the UTF-8 bytes: **ES256** (JOSE raw `r||s` encoding, not DER), **EdDSA** (Ed25519), or **HMAC-SHA-256**. Encode base64url.

## Vectors

[`vectors.json`](./vectors.json) lists the artifacts that MUST verify and mutations that MUST fail (tampered payload, tampered nonce, wrong key, algorithm confusion, transplanted signature). Mutations use the same RFC 7386 merge-patch format as the schema vectors. The key is selected by the artifact's `key_id` unless the vector overrides it with `verify_with_key_id`.

Reference implementation of sign/verify: [`tools/crypto.mjs`](../../tools/crypto.mjs). The vectors run in CI via `demo/crypto.test.mjs`. To re-sign the examples after editing them: `node tools/resign-examples.mjs`.
