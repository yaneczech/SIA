import { createHash } from 'node:crypto';

/**
 * RFC 8785 (JSON Canonicalization Scheme) serializer.
 *
 * Object members are sorted by UTF-16 code units and serialized without
 * insignificant whitespace. Number and string serialization delegates to
 * JSON.stringify, whose ECMAScript formatting is what RFC 8785 specifies.
 */
export function jcs(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError('Non-finite numbers cannot be canonicalized');
    }
    if (value === undefined) throw new TypeError('undefined cannot be canonicalized');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => jcs(item)).join(',')}]`;
  }
  const members = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`);
  return `{${members.join(',')}}`;
}

/** SHA-256 over the RFC 8785 canonical form, as lowercase hex. */
export function canonicalSha256(value) {
  return createHash('sha256').update(jcs(value), 'utf8').digest('hex');
}

/**
 * Signing input per SIA Core Specification §6: the artifact's RFC 8785
 * canonical form with the signature member removed from its evidence block.
 */
export function signingInput(artifact, signatureContainer) {
  const clone = structuredClone(artifact);
  const container = clone[signatureContainer];
  if (container && typeof container === 'object') delete container.signature;
  return jcs(clone);
}
