import { readFile } from 'node:fs/promises';
import path from 'node:path';

const exampleFiles = Object.freeze({
  catalog: 'catalog.json',
  actorRegistry: 'actor-registry.json',
  policy: 'core.context-policy.json',
  instance: 'collision-warning.instance.json',
  context: 'context-attentive.json',
  plan: 'collision.render-plan.json',
  attempt: 'collision.dispatch-attempt.json',
  receipt: 'collision.delivery-receipt.json',
  response: 'collision.occupant-response.json',
  retention: 'now-playing.retention-record.json',
  audit: 'collision.audit-record.json',
});

/** Load the repository's published v0.4 dependency set. */
export async function loadReferenceBundle(root) {
  const directory = path.join(root, 'examples', 'v0.4');
  const entries = await Promise.all(Object.entries(exampleFiles).map(async ([key, file]) => [
    key,
    JSON.parse(await readFile(path.join(directory, file), 'utf8')),
  ]));
  return Object.fromEntries(entries);
}

function catalogWithDeclaration(catalog, declaration) {
  const nodes = catalog.nodes.some((node) => node.id === declaration.id)
    ? catalog.nodes.map((node) => node.id === declaration.id ? declaration : node)
    : [...catalog.nodes, declaration];
  return { ...catalog, nodes };
}

/**
 * Place one artifact into the published dependency set. The semantic validator
 * can then evaluate invariants that cross file boundaries without pretending
 * that JSON Schema can express them.
 */
export function bundleForArtifact(contract, artifact, reference) {
  const common = {
    catalog: reference.catalog,
    actorRegistry: reference.actorRegistry,
    policy: reference.policy,
    instance: reference.instance,
    context: reference.context,
    plan: reference.plan,
    attempts: [reference.attempt],
    receipts: [reference.receipt],
    response: reference.response,
    retention: reference.retention,
    audit: reference.audit,
  };

  switch (contract) {
    case 'interaction-node.schema.json': {
      const catalog = catalogWithDeclaration(reference.catalog, artifact);
      return {
        catalog,
        policy: reference.policy,
        ...(reference.instance.node_id === artifact.id ? { actorRegistry: reference.actorRegistry, instance: reference.instance } : {}),
      };
    }
    case 'catalog.schema.json':
      return { ...common, catalog: artifact };
    case 'actor-registry.schema.json':
      return { ...common, actorRegistry: artifact };
    case 'context-policy.schema.json':
      return { ...common, policy: artifact };
    case 'runtime-instance.schema.json':
      return { ...common, instance: artifact };
    case 'context-snapshot.schema.json':
      return { ...common, context: artifact };
    case 'render-plan.schema.json':
      return { ...common, plan: artifact };
    case 'dispatch-attempt.schema.json':
      return { ...common, attempts: [artifact] };
    case 'delivery-receipt.schema.json':
      return { ...common, receipts: [artifact] };
    case 'occupant-response.schema.json':
      return { ...common, response: artifact };
    case 'retention-record.schema.json':
      return { catalog: reference.catalog, policy: reference.policy, retention: artifact };
    case 'audit-record.schema.json':
      return { ...common, audit: artifact };
    default:
      return {};
  }
}
