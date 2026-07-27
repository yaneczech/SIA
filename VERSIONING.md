# SIA Versioning Policy

## One public version

The repository publishes one SIA release version. The current release is **0.4.0 – pre-standard draft**.

That same version MUST identify the README, Core Specification, schemas, published `sia-minimal` profile, catalog, policies, registries, renderer capabilities, examples, conformance material, demo, and interactive documentation. A commit may clarify or repair the current draft without inventing another public version. A new version exists only when the complete release bundle is updated, validated, signed, documented, and tagged together.

Asset cache keys, build numbers, commit IDs, and documentation revisions are implementation details. They MUST NOT use SIA-shaped semantic versions in public URLs or UI because they can be mistaken for protocol versions.

## Artifact identifiers

SIA artifacts carry several identifiers because a runtime must bind the exact material used for a decision:

| Identifier | Purpose |
|---|---|
| `spec_version` | Exact wire contract and lifecycle rules. |
| `profile_id` + `profile_version` | Exact bounded conformance profile. |
| `catalog_version` | Exact installed semantic vocabulary. |
| policy, registry, and capability versions | Exact signed deployment authorities used by the decision. |

These are protocol bindings, not competing public product versions. In the repository's published `sia-minimal` bundle, every release-owned version is **0.4.0**. Production deployments may evolve catalogs or authorities independently, but they MUST preserve every exact binding and document their compatibility policy; those deployment revisions do not rename the SIA release.

An artifact set MUST NOT mix release-owned versions. Changing any signed artifact requires regenerated digests and signatures for every dependent artifact.

## Compatibility and future releases

`spec_version` is an exact negotiated contract identifier. Implementations MUST reject an unsupported value; they MUST NOT infer compatibility from a shared major or minor number. Supporting more than one contract means explicitly installing and negotiating each complete contract bundle.

- A correction that does not require a new contract remains part of the current draft and does not create a patch-labelled wire version.
- An additive capability that changes machine-readable contracts requires a new, explicitly negotiated release bundle.
- A change to the meaning of an existing field or lifecycle state is breaking and requires a new release bundle.

Pre-1.0 releases may break earlier drafts. The release notes for any future version MUST list compatibility, migration, and fallback behaviour before that version appears in schemas or examples.

## Catalog evolution

Within a deployment:

1. New nodes and optional declaration fields are additive only when the installed contract supports them.
2. A subclass may strengthen, never weaken, safety, attention, or trust requirements.
3. Deprecated nodes remain resolvable for a declared support window (`deprecated_since`, `replaced_by`).
4. Every unknown node fails closed in the Minimal 0.4.0 profile. Parent fallback requires an explicitly negotiated profile with a signed compatibility mapping; a runtime never infers it from an ID prefix.
5. A profile accepts an older catalog only when its compatibility table proves every referenced node is understood.

## Registries and conformance vectors

Reason codes ([`registry/reason-codes.json`](./registry/reason-codes.json)) are append-only: a code is never reused with a different meaning and is deprecated rather than deleted. Unknown codes are treated as the failure outcome for their phase.

Vectors are only added or corrected, never silently changed in meaning. A vector whose expectation changes gets a new `name`; the old vector remains associated with the release bundle whose behaviour it tests.
