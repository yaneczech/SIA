import { createHmac, createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, timingSafeEqual } from 'node:crypto';
import { signingInput } from './canonical.mjs';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/**
 * Sign an SIA artifact per Core Specification §6: the signature is computed
 * over the UTF-8 bytes of the artifact's RFC 8785 canonical form with the
 * `signature` member removed from its evidence block.
 *
 * `key` is one entry from conformance/crypto/test-keys.json (or an object of
 * the same shape): `{ algorithm, private_jwk?, secret_b64url? }`.
 * ES256 signatures use the JOSE raw r||s encoding (ieee-p1363), not DER.
 */
export function signArtifact(artifact, signatureContainer, key) {
  const data = Buffer.from(signingInput(artifact, signatureContainer), 'utf8');
  switch (key.algorithm) {
    case 'ES256': {
      const privateKey = createPrivateKey({ key: key.private_jwk, format: 'jwk' });
      return b64url(cryptoSign('sha256', data, { key: privateKey, dsaEncoding: 'ieee-p1363' }));
    }
    case 'EdDSA': {
      const privateKey = createPrivateKey({ key: key.private_jwk, format: 'jwk' });
      return b64url(cryptoSign(null, data, privateKey));
    }
    case 'HMAC-SHA-256': {
      const secret = Buffer.from(key.secret_b64url, 'base64url');
      return b64url(createHmac('sha256', secret).update(data).digest());
    }
    default:
      throw new Error(`Unsupported algorithm: ${key.algorithm}`);
  }
}

/** Verify an SIA artifact signature. Returns boolean; never throws on bad signatures. */
export function verifyArtifact(artifact, signatureContainer, key) {
  const container = artifact?.[signatureContainer];
  const signature = container?.signature;
  const declaredAlgorithm = container?.algorithm;
  if (typeof signature !== 'string' || declaredAlgorithm !== key.algorithm) return false;
  const data = Buffer.from(signingInput(artifact, signatureContainer), 'utf8');
  try {
    const signatureBytes = Buffer.from(signature, 'base64url');
    switch (key.algorithm) {
      case 'ES256': {
        const publicKey = createPublicKey({ key: key.public_jwk, format: 'jwk' });
        return cryptoVerify('sha256', data, { key: publicKey, dsaEncoding: 'ieee-p1363' }, signatureBytes);
      }
      case 'EdDSA': {
        const publicKey = createPublicKey({ key: key.public_jwk, format: 'jwk' });
        return cryptoVerify(null, data, publicKey, signatureBytes);
      }
      case 'HMAC-SHA-256': {
        const secret = Buffer.from(key.secret_b64url, 'base64url');
        const expected = createHmac('sha256', secret).update(data).digest();
        return signatureBytes.length === expected.length && timingSafeEqual(signatureBytes, expected);
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}
