import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPhaseTrace, coordinateAcknowledgement, coordinateDelivery, evaluateInteraction, trustMatrix } from './sia-engine.js';

const valid = { actorClass: 'adas', signatureValid: true, ageMs: 80, replayed: false, vehicleState: 'moving', renderers: { cluster: true, voice: true, ivi: true } };
const nowPlaying = { nodeId: 'Interaction.Event.Notification.Media.NowPlaying', actorClass: 'third_party_app', signatureValid: true, ageMs: 40, replayed: false, vehicleState: 'moving', renderers: { cluster: true, voice: true, ivi: true } };

test('valid ADAS warning is dispatched to cluster and voice', () => {
  const result = evaluateInteraction(valid);
  assert.equal(result.outcome, 'dispatched');
  assert.equal(result.primary, 'cluster');
  assert.deepEqual(result.concurrent, ['voice']);
  assert.ok(result.rejectedRenderers.includes('ivi'));
});

test('third-party app cannot emit collision warning even with valid signature', () => {
  const result = evaluateInteraction({ ...valid, actorClass: 'third_party_app' });
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.auditCode, 'TRUST_REJECTED_ACTOR');
});

test('message older than the node freshness limit fails closed', () => {
  const result = evaluateInteraction({ ...valid, ageMs: 201 });
  assert.equal(result.accepted, false);
  assert.equal(result.auditCode, 'TRUST_REJECTED_FRESHNESS');
});

test('replayed message is rejected', () => {
  const result = evaluateInteraction({ ...valid, replayed: true });
  assert.equal(result.auditCode, 'TRUST_REJECTED_REPLAY');
});

test('voice is used as fallback when cluster is offline', () => {
  const result = evaluateInteraction({ ...valid, renderers: { cluster: false, voice: true, ivi: true } });
  assert.equal(result.outcome, 'fallback');
  assert.equal(result.primary, 'voice');
});

test('IVI is never selected for a critical alert while moving', () => {
  const result = evaluateInteraction({ ...valid, renderers: { cluster: false, voice: false, ivi: true } });
  assert.equal(result.outcome, 'no_safe_renderer');
  assert.equal(result.primary, null);
});

test('charging makes the moving-only collision warning not applicable', () => {
  const result = evaluateInteraction({ ...valid, vehicleState: 'charging' });
  assert.equal(result.outcome, 'not_applicable');
  assert.equal(result.auditCode, 'CONTEXT_NOT_APPLICABLE');
  assert.equal(result.primary, null);
});

test('unknown vehicle context is treated as moving strict mode', () => {
  const result = evaluateInteraction({ ...valid, vehicleState: 'unknown' });
  assert.equal(result.contextMode, 'moving_strict');
  assert.equal(result.primary, 'cluster');
});

test('renderer presentation receipt confirms machine delivery', () => {
  const decision = evaluateInteraction(valid);
  const delivery = coordinateDelivery(valid, decision, { receipts: {
    cluster: { state: 'presented', elapsedMs: 72 },
    voice: { state: 'presented', elapsedMs: 90 },
  } });
  assert.equal(delivery.state, 'presented');
  assert.equal(delivery.delivered, true);
  assert.deepEqual(delivery.deliveredVia, ['cluster', 'voice']);
  assert.equal(delivery.auditCode, 'DELIVERY_PRESENTED');
});

test('failed primary delivery falls back to a renderer that confirms presentation', () => {
  const decision = evaluateInteraction(valid);
  const delivery = coordinateDelivery(valid, decision, { receipts: {
    cluster: { state: 'failed', elapsedMs: 118 },
    voice: { state: 'presented', elapsedMs: 156 },
  } });
  assert.equal(delivery.state, 'fallback_presented');
  assert.equal(delivery.delivered, true);
  assert.equal(delivery.fallbackUsed, true);
  assert.deepEqual(delivery.deliveredVia, ['voice']);
  assert.equal(delivery.auditCode, 'DELIVERY_FALLBACK_PRESENTED');
});

test('received is transport acceptance, not proof of presentation', () => {
  const decision = evaluateInteraction(valid);
  const delivery = coordinateDelivery(valid, decision, { receipts: {
    cluster: { state: 'received', elapsedMs: 40 },
    voice: { state: 'received', elapsedMs: 50 },
  } });
  assert.equal(delivery.state, 'received');
  assert.equal(delivery.delivered, false);
  assert.equal(delivery.final, false);
});

test('primary_presented rejects a non-primary presentation', () => {
  const input = {
    nodeId: 'Interaction.Event.Notification.Diagnostic.CollisionSensorTest',
    actorClass: 'service', signatureValid: true, ageMs: 40, replayed: false,
    vehicleState: 'moving', driverState: 'attentive',
    renderers: { cluster: true, voice: true, ivi: true },
  };
  const decision = evaluateInteraction(input);
  const delivery = coordinateDelivery(input, decision, { receipts: {
    ivi: { state: 'failed', elapsedMs: 300 },
    voice: { state: 'presented', elapsedMs: 250 },
  } });
  assert.equal(decision.node.presentationContract.deliverySuccessPolicy, 'primary_presented');
  assert.equal(delivery.delivered, false);
  assert.equal(delivery.auditCode, 'DELIVERY_FAILED_POLICY');
});

test('all_required_presented waits for every required renderer', () => {
  const base = evaluateInteraction(valid);
  const decision = structuredClone(base);
  decision.node.presentationContract.deliverySuccessPolicy = 'all_required_presented';
  decision.node.presentationContract.requiredRenderers = ['cluster', 'voice'];

  const incomplete = coordinateDelivery(valid, decision, { receipts: {
    cluster: { state: 'presented', elapsedMs: 72 },
    voice: { state: 'failed', elapsedMs: 90 },
  } });
  assert.equal(incomplete.delivered, false);
  assert.equal(incomplete.final, true);

  const complete = coordinateDelivery(valid, decision, { receipts: {
    cluster: { state: 'presented', elapsedMs: 72 },
    voice: { state: 'presented', elapsedMs: 90 },
  } });
  assert.equal(complete.delivered, true);
  assert.deepEqual(complete.deliveredVia, ['cluster', 'voice']);
});

test('delivery timeout never starts occupant acknowledgement', () => {
  const decision = evaluateInteraction(valid);
  const delivery = coordinateDelivery(valid, decision, { receipts: {
    cluster: { state: 'timed_out', elapsedMs: 300 },
    voice: { state: 'timed_out', elapsedMs: 300 },
  } });
  const ack = coordinateAcknowledgement(decision, { acknowledged: true, elapsedMs: 420 }, delivery);
  assert.equal(delivery.state, 'failed');
  assert.equal(delivery.auditCode, 'DELIVERY_FAILED_POLICY');
  assert.equal(ack.state, 'not_started');
  assert.equal(ack.auditCode, 'OCCUPANT_RESPONSE_NOT_STARTED');
});

test('explicit acknowledgement closes a dispatched interaction', () => {
  const decision = evaluateInteraction(valid);
  const ack = coordinateAcknowledgement(decision, { acknowledged: true, elapsedMs: 420 });
  assert.equal(ack.state, 'acknowledged');
  assert.equal(ack.closed, true);
  assert.equal(ack.auditCode, 'OCCUPANT_ACKNOWLEDGED');
});

test('missing acknowledgement closes through defined timeout', () => {
  const decision = evaluateInteraction(valid);
  const ack = coordinateAcknowledgement(decision, { acknowledged: false, elapsedMs: 2000 });
  assert.equal(ack.state, 'timed_out');
  assert.equal(ack.closed, true);
});

test('rejected interaction never starts occupant response', () => {
  const decision = evaluateInteraction({ ...valid, actorClass: 'third_party_app' });
  const response = coordinateAcknowledgement(decision);
  assert.equal(response.state, 'not_started');
  assert.equal(response.auditCode, 'OCCUPANT_RESPONSE_NOT_STARTED');
});

test('phase trace exposes ontology, inputs, policy, decision, and acknowledgement state', () => {
  const decision = evaluateInteraction(valid);
  const delivery = coordinateDelivery(valid, decision, { receipts: { cluster: 'presented', voice: 'presented' } });
  const ack = coordinateAcknowledgement(decision, { acknowledged: true, elapsedMs: 420 }, delivery);
  const trace = buildPhaseTrace(valid, decision, ack, delivery);
  assert.deepEqual(Object.keys(trace), ['ontology', 'emitter', 'trust', 'translation', 'runtime', 'renderers']);
  assert.equal(trace.trust.trace.checks.actor, 'pass');
  assert.equal(trace.translation.trace.render_plan.primary, 'cluster');
  assert.equal(trace.runtime.trace.delivery.state, 'presented');
  assert.equal(trace.runtime.trace.occupant_response.state, 'acknowledged');
  assert.equal(trace.renderers.trace.delivery_receipts.cluster.state, 'presented');
});

test('a notification without ack requirement closes immediately after dispatch', () => {
  const decision = evaluateInteraction(nowPlaying);
  assert.equal(decision.outcome, 'dispatched');
  const ack = coordinateAcknowledgement(decision);
  assert.equal(ack.state, 'not_required');
});

test('distracted driver coalesces Now Playing to the latest retained state', () => {
  const result = evaluateInteraction({ ...nowPlaying, roadType: 'urban', driverState: 'distracted' });
  assert.equal(result.outcome, 'context_deferred');
  assert.equal(result.auditCode, 'CONTEXT_COALESCED_DISTRACTED');
  assert.equal(result.retention.disposition, 'coalesce');
  assert.equal(result.retention.state, 'held');
  assert.equal(result.retention.replaceExisting, true);
  assert.match(result.retention.key, new RegExp(`^${nowPlaying.nodeId}:driver:third_party_app:`));
  assert.deepEqual(result.retention.keyFields, ['node_id', 'target_role', 'actor_id', 'payload.session_id']);
});

test('a deferred Now Playing state is dispatched after the driver becomes attentive', () => {
  const held = evaluateInteraction({ ...nowPlaying, driverState: 'distracted' });
  const reevaluated = evaluateInteraction({ ...nowPlaying, driverState: 'attentive' });
  assert.equal(held.outcome, 'context_deferred');
  assert.equal(reevaluated.outcome, 'dispatched');
  assert.equal(reevaluated.primary, 'ivi');
  assert.equal(reevaluated.retention, undefined);
});

test('a diagnostic notification is deferred with a finite retention TTL', () => {
  const result = evaluateInteraction({
    nodeId: 'Interaction.Event.Notification.Diagnostic.CollisionSensorTest',
    actorClass: 'service', signatureValid: true, ageMs: 40, replayed: false,
    vehicleState: 'moving', driverState: 'distracted',
    renderers: { cluster: true, voice: true, ivi: true },
  });
  assert.equal(result.outcome, 'context_deferred');
  assert.equal(result.auditCode, 'CONTEXT_DEFERRED');
  assert.equal(result.retention.disposition, 'defer');
  assert.equal(result.retention.ttlMs, 60000);
});

test('an ephemeral assistant suggestion is recorded and dropped while the driver is distracted', () => {
  const result = evaluateInteraction({
    nodeId: 'Interaction.Event.Notification.Assistant.Suggestion',
    actorClass: 'agent_local', signatureValid: true, ageMs: 40, replayed: false,
    vehicleState: 'moving', driverState: 'distracted',
    renderers: { cluster: true, voice: true, ivi: true },
  });
  assert.equal(result.outcome, 'context_dropped');
  assert.equal(result.auditCode, 'CONTEXT_BLOCKED_DROPPED');
  assert.equal(result.retention.disposition, 'drop');
  assert.equal(result.retention.state, 'dropped');
});

test('a drowsy driver does not suppress the notification but reroutes it off the over-budget renderer', () => {
  const result = evaluateInteraction({ ...nowPlaying, roadType: 'highway', driverState: 'drowsy' });
  assert.equal(result.accepted, true);
  assert.notEqual(result.outcome, 'context_dropped');
  assert.equal(result.primary, 'voice');
  assert.ok(result.rejectedRenderers.includes('ivi'));
  assert.ok(result.attention.effective > result.attention.budgets.ivi.budget);
});

test('a critical alert is never blocked by an attention budget calculation', () => {
  const result = evaluateInteraction({ ...valid, driverState: 'distracted', roadType: 'off_road' });
  assert.equal(result.outcome, 'dispatched');
  assert.equal(result.primary, 'cluster');
});

test('a reserved runtime priority claim is rejected by the closed envelope', () => {
  const result = evaluateInteraction({ ...nowPlaying, roadType: 'urban', driverState: 'distracted', injectedPriority: 'critical' });
  assert.equal(result.priority.declared, 'low');
  assert.equal(result.priority.overridden, true);
  assert.equal(result.priority.reservedFieldRejected, true);
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.auditCode, 'TRUST_REJECTED_ENVELOPE');
});

test('an in-vehicle AI assistant cannot emit a collision warning but can emit its own suggestion node', () => {
  const asAlert = evaluateInteraction({ ...valid, actorClass: 'agent_local' });
  assert.equal(asAlert.outcome, 'rejected');

  const asSuggestion = evaluateInteraction({
    nodeId: 'Interaction.Event.Notification.Assistant.Suggestion',
    actorClass: 'agent_local', signatureValid: true, ageMs: 50, replayed: false,
    vehicleState: 'moving', renderers: { cluster: true, voice: true, ivi: true },
  });
  assert.equal(asSuggestion.accepted, true);
  assert.notEqual(asSuggestion.outcome, 'rejected');
});

test('trust matrix reflects the node catalog: ADAS may not emit the media notification', () => {
  const matrix = trustMatrix();
  const adasRow = matrix.find((row) => row.actor === 'adas');
  const mediaCell = adasRow.cells.find((cell) => cell.nodeId === 'Interaction.Event.Notification.Media.NowPlaying');
  assert.equal(mediaCell.allowed, false);
});

test('every terminal audit code the engine emits is registered in registry/reason-codes.json', async () => {
  const { readFile } = await import('node:fs/promises');
  const registry = JSON.parse(await readFile(new URL('../registry/reason-codes.json', import.meta.url), 'utf8'));
  const registered = new Set(Object.values(registry.phases).flat().map((entry) => entry.code));
  // In-flight UI states are not terminal transitions and are intentionally unregistered.
  const transient = new Set(['DELIVERY_PENDING', 'DELIVERY_RECEIVED', 'DELIVERY_NOT_DISPATCHED', 'OCCUPANT_RESPONSE_PENDING', 'OCCUPANT_RESPONSE_NOT_REQUIRED']);

  const observed = new Set();
  const scenarios = [
    valid,
    { ...valid, actorClass: 'third_party_app' },
    { ...valid, ageMs: 999 },
    { ...valid, replayed: true },
    { ...valid, signatureValid: false },
    { ...valid, injectedPriority: 'critical' },
    { ...valid, vehicleState: 'charging' },
    { ...valid, renderers: { cluster: false, voice: true, ivi: true } },
    { ...valid, renderers: { cluster: false, voice: false, ivi: true } },
    { ...nowPlaying, roadType: 'urban', driverState: 'distracted' },
    { ...nowPlaying, nodeId: 'Interaction.Event.Notification.Diagnostic.CollisionSensorTest', actorClass: 'service', driverState: 'distracted' },
    { ...nowPlaying, nodeId: 'Interaction.Event.Notification.Assistant.Suggestion', actorClass: 'agent_local', driverState: 'distracted' },
  ];
  for (const input of scenarios) {
    const decision = evaluateInteraction(input);
    observed.add(decision.auditCode);
    const presented = Object.fromEntries((decision.primary ? [decision.primary, ...decision.concurrent] : []).map((name) => [name, { state: 'presented', elapsedMs: 80 }]));
    const delivery = coordinateDelivery(input, decision, { receipts: presented });
    observed.add(delivery.auditCode);
    observed.add(coordinateAcknowledgement(decision, { acknowledged: true, elapsedMs: 400 }, delivery).auditCode);
    observed.add(coordinateAcknowledgement(decision, { acknowledged: false, elapsedMs: 5000 }, delivery).auditCode);
  }
  for (const code of observed) {
    if (transient.has(code)) continue;
    assert.ok(registered.has(code), `engine emits unregistered terminal code ${code}`);
  }
});
