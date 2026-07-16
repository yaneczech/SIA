import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { canonicalSha256 } from './canonical.mjs';

export async function loadPayloadContracts(root, ajv) {
  const directory = path.join(root, 'schema', 'payloads');
  const contracts = new Map();
  for (const file of await readdir(directory)) {
    const match = file.match(/^(.+)\.v(\d+)\.schema\.json$/);
    if (!match) continue;
    const schema = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
    contracts.set(`sia:payload:${match[1]}:${match[2]}`, {
      digest: canonicalSha256(schema),
      file,
      validate: ajv.compile(schema),
    });
  }
  return contracts;
}

export function validateDeclarationPayloadBinding(declaration, contracts) {
  const contract = contracts.get(declaration.payload_schema_ref);
  if (!contract) return [{ code: 'PAYLOAD_SCHEMA_UNRESOLVED', message: `${declaration.id}: ${declaration.payload_schema_ref} is not installed.` }];
  return contract.digest === declaration.payload_schema_sha256 ? [] : [{
    code: 'PAYLOAD_SCHEMA_DIGEST_MISMATCH',
    message: `${declaration.id}: payload schema digest does not match ${contract.file}.`,
  }];
}

export function validateCatalogPayloadBindings(catalog, contracts) {
  return (catalog.nodes || []).flatMap((node) => validateDeclarationPayloadBinding(node, contracts));
}

export function validateRuntimePayload(instance, catalog, contracts) {
  const declaration = catalog.nodes?.find((node) => node.id === instance.node_id);
  if (!declaration) return [];
  const binding = validateDeclarationPayloadBinding(declaration, contracts);
  if (binding.length) return binding;
  const contract = contracts.get(declaration.payload_schema_ref);
  if (contract.validate(instance.payload)) return [];
  return [{
    code: 'INSTANCE_PAYLOAD_INVALID',
    message: `${instance.node_id}: ${contract.validate.errors.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')}.`,
  }];
}

