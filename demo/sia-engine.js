export const ACTOR_CLASSES = [
  { id: 'human_direct', label: 'Driver (direct input)' },
  { id: 'adas', label: 'ADAS' },
  { id: 'service', label: 'Vehicle service' },
  { id: 'third_party_app', label: 'Third-party app' },
  { id: 'agent_local', label: 'In-vehicle AI assistant' },
  { id: 'agent_cloud', label: 'Cloud AI assistant' },
];

export const RENDERERS = Object.freeze({
  cluster: { label: 'Cluster', glanceOptimized: true, safetyProfile: 'safety_relevant_visual', maxGlanceBudgetMs: 1000, maxSimultaneousElements: 6, textMaxChars: 48 },
  ivi: { label: 'Center display', glanceOptimized: false, safetyProfile: 'general_interactive_visual', maxGlanceBudgetMs: 2200, maxSimultaneousElements: 12, textMaxChars: 160 },
  voice: { label: 'Voice', glanceOptimized: true, safetyProfile: 'audio_eyes_free', maxGlanceBudgetMs: null, maxSimultaneousElements: 1, textMaxChars: null },
});

export const CONTEXT_MODIFIERS = Object.freeze({
  road_type: { urban: 1.0, rural: 0.9, highway: 1.2, off_road: 1.3 },
  driver_state: { attentive: 1.0, drowsy: 1.3, distracted: 1.5, not_monitoring: 1.0, unknown: 1.2 },
});

export const NODES = Object.freeze({
  'Interaction.Event.Alert.Collision.Warning': {
    type: 'Alert',
    label: 'Collision warning',
    priority: 'critical',
    semanticValidityMs: 500,
    trustRequirements: { permittedActorClasses: ['adas'], maxIngressAgeMs: 200 },
    contextPolicy: { applicability: 'moving_only', unknownContext: 'safe_worst_case', onBlocked: { disposition: 'never_block' } },
    presentationContract: { preferredRenderers: ['cluster', 'voice'], requiredRenderers: [], deliverySuccessPolicy: 'any_selected_presented', deliveryTimeoutMs: 300, degradationPolicy: 'next_eligible' },
    occupantResponse: { kind: 'explicit_or_timeout', authority: 'driver_only', timeoutMs: 2000 },
    attention: { glanceTimeMs: 800, meanGlanceMs: 300, taskSteps: 0, voiceAlt: true, cognitiveLoad: 'minimal' },
    regulatoryBasis: ['ISO 15623', 'UNECE R152'],
  },
  'Interaction.Event.Notification.Diagnostic.CollisionSensorTest': {
    type: 'Notification',
    label: 'Collision-sensor diagnostic',
    priority: 'normal',
    semanticValidityMs: 60000,
    trustRequirements: { permittedActorClasses: ['adas', 'service'], maxIngressAgeMs: 5000 },
    contextPolicy: { applicability: 'always', unknownContext: 'safe_worst_case', onBlocked: { disposition: 'defer', ttlMs: 60000, reevaluateOn: ['driver_state_change', 'vehicle_state_change'], onExpiry: 'drop', maxPending: 10 } },
    presentationContract: { preferredRenderers: ['ivi'], requiredRenderers: [], deliverySuccessPolicy: 'primary_presented', deliveryTimeoutMs: 1200, degradationPolicy: 'no_degradation' },
    occupantResponse: { kind: 'none' },
    attention: { glanceTimeMs: 1200, meanGlanceMs: 500, taskSteps: 2, voiceAlt: false, cognitiveLoad: 'moderate' },
  },
  'Interaction.Event.Notification.Media.NowPlaying': {
    type: 'Notification',
    label: 'Now playing',
    priority: 'low',
    semanticValidityMs: 30000,
    trustRequirements: { permittedActorClasses: ['service', 'third_party_app'], maxIngressAgeMs: 5000 },
    contextPolicy: { applicability: 'always', unknownContext: 'safe_worst_case', onBlocked: { disposition: 'coalesce', ttlMs: 30000, coalescingKeyFields: ['node_id', 'target_role', 'actor_id', 'payload.session_id'], reevaluateOn: ['driver_state_change', 'vehicle_state_change'], onExpiry: 'drop', maxPendingPerKey: 1 } },
    presentationContract: { preferredRenderers: ['ivi', 'voice'], requiredRenderers: [], deliverySuccessPolicy: 'any_selected_presented', deliveryTimeoutMs: 1200, degradationPolicy: 'next_eligible' },
    occupantResponse: { kind: 'none' },
    attention: { glanceTimeMs: 1500, meanGlanceMs: 450, taskSteps: 1, voiceAlt: true, cognitiveLoad: 'minimal' },
  },
  'Interaction.Event.Notification.Assistant.Suggestion': {
    type: 'Notification',
    label: 'Assistant suggestion',
    priority: 'low',
    semanticValidityMs: 5000,
    trustRequirements: { permittedActorClasses: ['agent_local', 'agent_cloud', 'service'], maxIngressAgeMs: 2000 },
    contextPolicy: { applicability: 'always', unknownContext: 'safe_worst_case', onBlocked: { disposition: 'drop', auditRequired: true } },
    presentationContract: { preferredRenderers: ['ivi', 'voice'], requiredRenderers: [], deliverySuccessPolicy: 'any_selected_presented', deliveryTimeoutMs: 1200, degradationPolicy: 'drop_with_audit' },
    occupantResponse: { kind: 'none' },
    attention: { glanceTimeMs: 1000, meanGlanceMs: 400, taskSteps: 1, voiceAlt: true, cognitiveLoad: 'minimal' },
  },
});

export const DEFAULT_NODE_ID = 'Interaction.Event.Alert.Collision.Warning';

export function resolveNode(nodeId) {
  return NODES[nodeId] || NODES[DEFAULT_NODE_ID];
}

export function nodeCatalog() {
  return Object.entries(NODES).map(([id, node]) => ({ id, ...node }));
}

export function actorLabel(actorClass) {
  return (ACTOR_CLASSES.find((item) => item.id === actorClass) || {}).label || actorClass;
}

/**
 * Every actor × node permission, derived from the catalog — the literal
 * answer to "who is allowed to say what" (§6.3), not asserted separately.
 */
export function trustMatrix() {
  const nodes = nodeCatalog();
  return ACTOR_CLASSES.map((actor) => ({
    actor: actor.id,
    label: actor.label,
    cells: nodes.map((node) => ({ nodeId: node.id, allowed: node.trustRequirements.permittedActorClasses.includes(actor.id) })),
  }));
}

export function evaluateInteraction(input) {
  const node = resolveNode(input.nodeId);
  const roadType = input.roadType || 'highway';
  const driverState = input.driverState || 'attentive';

  const checks = [
    check('envelope', 'Closed runtime envelope', !input.injectedPriority, 'A runtime instance cannot override declaration-owned priority.'),
    check('signature', 'Digital signature', Boolean(input.signatureValid), 'The signature does not match.'),
    check('actor', 'Emitter authority', node.trustRequirements.permittedActorClasses.includes(input.actorClass), `${actorLabel(input.actorClass)} is not allowed to emit ${node.label}.`),
    check('freshness', 'Message freshness', Number.isFinite(input.ageMs) && input.ageMs <= node.trustRequirements.maxIngressAgeMs, `The message is ${input.ageMs} ms old; the ingress limit for this node is ${node.trustRequirements.maxIngressAgeMs} ms.`),
    check('replay', 'Replay protection', !input.replayed, 'The same message has already been processed.'),
  ];

  const priority = {
    declared: node.priority,
    injected: input.injectedPriority || null,
    overridden: Boolean(input.injectedPriority && input.injectedPriority !== node.priority),
    reservedFieldRejected: Boolean(input.injectedPriority),
  };

  const failed = checks.find((item) => !item.passed);
  if (failed) {
    return {
      nodeId: node === NODES[input.nodeId] ? input.nodeId : DEFAULT_NODE_ID,
      node,
      accepted: false,
      outcome: 'rejected',
      reason: failed.reason,
      checks,
      priority,
      contextMode: normalizeContext(input.vehicleState),
      attention: null,
      primary: null,
      concurrent: [],
      rejectedRenderers: availableRenderers(input),
      auditCode: failed.id === 'envelope' ? 'TRUST_REJECTED_ENVELOPE' : `TRUST_REJECTED_${failed.id.toUpperCase()}`,
    };
  }

  const contextMode = normalizeContext(input.vehicleState);
  const nodeId = Object.prototype.hasOwnProperty.call(NODES, input.nodeId) ? input.nodeId : DEFAULT_NODE_ID;

  if (node.contextPolicy.applicability === 'moving_only' && input.vehicleState === 'charging') {
    return {
      nodeId, node, accepted: true, outcome: 'not_applicable',
      reason: 'The declaration is moving-only and the vehicle is charging. The instance closes as not applicable; diagnostics require a separate typed node.',
      checks, priority, contextMode, attention: null, primary: null, concurrent: [],
      rejectedRenderers: availableRenderers(input), auditCode: 'CONTEXT_NOT_APPLICABLE',
    };
  }

  const blockedPolicy = node.contextPolicy.onBlocked;
  if (blockedPolicy.disposition !== 'never_block' && driverState === 'distracted') {
    const disposition = blockedPolicy.disposition;
    if (disposition === 'drop') {
      return {
        nodeId, node, accepted: true, outcome: 'context_dropped',
        reason: 'Driver distraction blocks presentation. This node is declared ephemeral, so Context Policy records and drops it instead of surfacing stale advice later.',
        checks, priority, contextMode, attention: null, primary: null, concurrent: [],
        rejectedRenderers: availableRenderers(input),
        retention: { disposition: 'drop', state: 'dropped', key: null, ttlMs: null, replaceExisting: false, reevaluateOn: [] },
        auditCode: 'CONTEXT_BLOCKED_DROPPED',
      };
    }

    const coalesced = disposition === 'coalesce';
    return {
      nodeId, node, accepted: true, outcome: 'context_deferred',
      reason: coalesced
        ? `Driver distraction blocks presentation. Context Policy retains only the latest ${node.label} state for up to ${blockedPolicy.ttlMs / 1000} s and re-evaluates it when the driver becomes attentive.`
        : `Driver distraction blocks presentation. Context Policy defers this notification for up to ${blockedPolicy.ttlMs / 1000} s and re-evaluates it when the driver becomes attentive.`,
      checks, priority, contextMode, attention: null, primary: null, concurrent: [],
      rejectedRenderers: availableRenderers(input),
      retention: {
        disposition,
        state: 'held',
        key: coalesced ? `${nodeId}:driver:${input.actorClass}:default-session` : null,
        keyFields: coalesced ? blockedPolicy.coalescingKeyFields : [],
        ttlMs: blockedPolicy.ttlMs,
        replaceExisting: coalesced,
        reevaluateOn: blockedPolicy.reevaluateOn || [],
      },
      auditCode: coalesced ? 'CONTEXT_COALESCED_DISTRACTED' : 'CONTEXT_DEFERRED',
    };
  }

  const modifier = (CONTEXT_MODIFIERS.road_type[roadType] || 1) * (CONTEXT_MODIFIERS.driver_state[driverState] || 1);
  const effective = Math.round(node.attention.glanceTimeMs * modifier);
  const attention = { base: node.attention.glanceTimeMs, roadType, driverState, modifier: Math.round(modifier * 100) / 100, effective, budgets: {} };

  const available = input.renderers || {};
  let primary = null;
  const concurrent = [];
  const rejectedRenderers = [];

  if (node.type === 'Alert') {
    // Safety mandate (§9.1): only safety-certified or eyes-free surfaces are structurally
    // eligible for a critical Alert. Attention numbers are still recorded for audit,
    // but they do not gate cluster/voice — a non-suppressible alert must not be
    // silently blocked by a budget calculation.
    for (const name of node.presentationContract.preferredRenderers) {
      if (available[name]) { primary = name; break; }
    }
    for (const name of Object.keys(available)) {
      if (!available[name]) continue;
      if (name === primary) { attention.budgets[name] = { eligible: true, reason: 'safety-certified surface — selected' }; continue; }
      if (name === 'voice' && primary && node.priority === 'critical' && node.attention.voiceAlt) {
        concurrent.push(name);
        attention.budgets[name] = { eligible: true, reason: 'eyes-free — concurrent with primary' };
        continue;
      }
      rejectedRenderers.push(name);
      attention.budgets[name] = { eligible: false, reason: RENDERERS[name]?.safetyProfile === 'general_interactive_visual' ? 'not a safety-certified surface' : 'not selected' };
    }
  } else {
    for (const name of node.presentationContract.preferredRenderers) {
      if (!available[name]) { continue; }
      const budget = RENDERERS[name].maxGlanceBudgetMs;
      const eligible = budget === null || effective <= budget;
      attention.budgets[name] = { eligible, budget, effective };
      if (eligible && !primary) { primary = name; continue; }
      if (!eligible) rejectedRenderers.push(name);
    }
    for (const name of Object.keys(available)) {
      if (!available[name] || node.presentationContract.preferredRenderers.includes(name) || name === primary) continue;
      rejectedRenderers.push(name);
      attention.budgets[name] = { eligible: false, reason: 'not in the declared fallback chain for this node' };
    }
  }

  if (!primary) {
    return {
      nodeId, node, accepted: true, outcome: 'no_safe_renderer',
      reason: 'The message passed verification, but no eligible renderer from the declared fallback chain is available.',
      checks, priority, contextMode, attention, primary: null, concurrent: [],
      rejectedRenderers: rejectedRenderers.length ? rejectedRenderers : availableRenderers(input),
      auditCode: 'NO_ELIGIBLE_RENDERER',
    };
  }

  const isFirstChoice = primary === node.presentationContract.preferredRenderers[0];
  return {
    nodeId, node,
    accepted: true,
    outcome: isFirstChoice ? 'dispatched' : 'fallback',
    reason: isFirstChoice
      ? `${RENDERERS[primary].label} is the safest eligible surface for this interaction${concurrent.length ? `, with ${concurrent.map((c) => RENDERERS[c].label).join(', ')} concurrently` : ''}.`
      : `${node.presentationContract.preferredRenderers[0] === 'cluster' ? 'The cluster is offline.' : 'The preferred renderer is unavailable or over budget.'} SIA uses the next safe option in the declared renderer order: ${RENDERERS[primary].label}.`,
    checks, priority, contextMode, attention, primary, concurrent,
    rejectedRenderers,
    auditCode: isFirstChoice ? (concurrent.length ? 'PRIMARY_AND_CONCURRENT_SELECTED' : 'PRIMARY_SELECTED') : 'FALLBACK_SELECTED',
  };
}

function check(id, label, passed, reason) {
  return { id, label, passed: Boolean(passed), reason: passed ? null : reason };
}

function normalizeContext(vehicleState) {
  if (vehicleState === 'unknown') return 'moving_strict';
  if (vehicleState === 'charging') return 'not_moving';
  return 'moving';
}

function availableRenderers(input) {
  return Object.entries(input.renderers || {}).filter(([, available]) => available).map(([name]) => name);
}

function requiresOccupantResponse(node) {
  return node?.occupantResponse?.kind !== 'none';
}

export function buildPhaseTrace(input, decision, acknowledgement = null, delivery = null) {
  const node = decision.node;
  const deferred = decision.outcome === 'context_deferred';
  const responseRequired = requiresOccupantResponse(node);
  const checkSummary = Object.fromEntries(decision.checks.map(({ id, passed }) => [id, passed ? 'pass' : 'fail']));
  const selected = decision.primary ? [decision.primary, ...decision.concurrent] : [];
  const deliveryState = delivery?.state || (decision.primary ? 'pending' : 'not_dispatched');
  const deliveryVia = delivery?.deliveredVia?.map((name) => RENDERERS[name]?.label || name).join(' + ') || 'none';
  const ackState = acknowledgement?.state || (responseRequired ? (decision.primary && delivery?.delivered ? 'pending' : 'not_started') : 'not_required');
  const ackAuditCode = acknowledgement?.auditCode || (ackState === 'not_started' ? 'OCCUPANT_RESPONSE_NOT_STARTED' : ackState === 'pending' ? 'OCCUPANT_RESPONSE_PENDING' : 'OCCUPANT_RESPONSE_NOT_REQUIRED');
  const interactionClosed = acknowledgement?.closed ?? (deferred ? false : (delivery?.final ?? !decision.primary));
  const actor = actorLabel(input.actorClass);
  const allRenderers = ['cluster', 'voice', 'ivi'];

  return {
    ontology: {
      icon: 'book-open',
      question: 'What was declared, once, in the vocabulary?',
      answer: `${node.label} is defined a single time — trust, attention and fallback are properties of the declaration, not of any single emission.`,
      explanation: 'This card is authored before any vehicle ships. It never changes at runtime; only its instances (emissions) do.',
      input: { title: 'Node identity', items: [decision.nodeId, `type: ${node.type}`, `priority: ${node.priority}`] },
      rule: { title: 'Declared contract', items: [`permitted actors: ${node.trustRequirements.permittedActorClasses.join(', ')}`, `ingress age ≤ ${node.trustRequirements.maxIngressAgeMs} ms`, `applicability: ${node.contextPolicy.applicability}`, `when blocked: ${node.contextPolicy.onBlocked.disposition}`] },
      output: { title: 'Attention + delivery', items: [`base glance: ${node.attention.glanceTimeMs} ms`, `renderer order: ${node.presentationContract.preferredRenderers.join(' → ')}`, `retention TTL: ${node.contextPolicy.onBlocked.ttlMs == null ? 'none' : `${node.contextPolicy.onBlocked.ttlMs} ms`}`, `delivery policy: ${node.presentationContract.deliverySuccessPolicy}`, `occupant response: ${node.occupantResponse.kind}`] },
      rationale: 'Every downstream phase reads this declaration. Nothing here is trusted from the runtime payload — that separation is what makes the rest of the pipeline auditable.',
      trace: { node_id: decision.nodeId, declaration: node },
    },
    emitter: {
      icon: 'radar',
      question: 'What happened?',
      answer: `${actor} turns a situation into a typed interaction instance.`,
      explanation: 'The emitter does not choose a screen or assign itself authority. It submits meaning, payload, and evidence about its own origin.',
      input: { title: 'Domain decision', items: node.type === 'Alert' ? ['Collision risk detected', 'Time to collision: 1.4 s', 'Threat bearing: 12°'] : ['Domain event detected', `Emits: ${node.label}`] },
      rule: { title: 'Create typed instance', items: ['Use the ontology identifier', 'Attach runtime payload', 'Sign canonical instance'] },
      output: { title: 'Node + attestation', items: [decision.nodeId, `actor_class: ${input.actorClass}`, `age: ${input.ageMs} ms`] },
      rationale: 'SIA begins after the domain decision. Its job is interaction integrity, not sensing, planning, or content correctness.',
      trace: {
        node_id: decision.nodeId,
        payload: node.type === 'Alert' ? { time_to_collision_s: 1.4, threat_bearing_deg: 12, threat_range_m: 18, relative_speed_kmh: 42 } : { note: 'illustrative payload' },
        priority_claim: decision.priority.injected ? { injected: decision.priority.injected, result: 'closed-envelope rejection' } : null,
        attestation: { actor_class: input.actorClass, signature_valid: input.signatureValid, age_ms: input.ageMs, replayed: input.replayed },
      },
    },
    trust: {
      icon: decision.accepted ? 'shield-check' : 'shield-x',
      question: 'Is this emitter allowed to say this?',
      answer: decision.accepted ? 'The node satisfies every declared trust requirement.' : `The node fails closed: ${decision.reason}`,
      explanation: 'Authentication alone is not enough. Trust Policy checks semantic authority, freshness, and replay protection before any renderer can see the node.',
      input: { title: 'Node + attestation', items: [`Actor: ${actor}`, `Signature: ${input.signatureValid ? 'valid' : 'invalid'}`, `Message age: ${input.ageMs} ms`] },
      rule: { title: 'Verify requirements', items: ['closed runtime envelope', `actor ∈ [${node.trustRequirements.permittedActorClasses.join(', ')}]`, 'signature = valid', `ingress age ≤ ${node.trustRequirements.maxIngressAgeMs} ms`, 'nonce = unused'] },
      output: { title: decision.accepted ? 'Verified node' : 'Security rejection', items: decision.accepted ? ['Trust status: verified', 'Node may enter Translation', 'Provenance retained'] : [`Code: ${decision.auditCode}`, 'No renderer dispatch', 'Security event logged'] },
      rationale: decision.accepted ? 'All four checks pass. The verified semantic identity — not payload-supplied priority — continues downstream.' : 'A single failed requirement stops the interaction before translation. Criticality never overrides trust failure.',
      trace: { requirements: { permitted_actor_classes: node.trustRequirements.permittedActorClasses, signed_origin_required: true, max_ingress_age_ms: node.trustRequirements.maxIngressAgeMs, replay_protection: 'required' }, observed: { actor_class: input.actorClass, signature_valid: input.signatureValid, ingress_age_ms: input.ageMs, replayed: input.replayed, reserved_priority_field: input.injectedPriority || null }, checks: checkSummary, decision: decision.accepted ? 'verified' : decision.auditCode },
    },
    translation: {
      icon: 'route',
      question: 'Which output is safe in this context?',
      answer: !decision.accepted ? 'Translation never receives a rejected node.' : deferred ? 'Context Policy holds the semantic state without dispatching it yet.' : decision.outcome === 'context_dropped' ? 'Context Policy records and drops this applicable node before renderer selection.' : decision.outcome === 'not_applicable' ? 'The node is not meaningful in this context, so no delivery starts.' : decision.primary ? `${RENDERERS[decision.primary].label} is selected as the primary renderer.` : 'No eligible renderer is available.',
      explanation: 'Translation combines immutable node meaning with live context, a context-scaled attention budget, and declared renderer capabilities. It does not let each screen reinterpret policy locally.',
      input: { title: 'Verified node + context', items: [`Vehicle: ${input.vehicleState}`, `Road: ${decision.attention?.roadType || input.roadType || 'highway'}`, `Driver: ${decision.attention?.driverState || input.driverState || 'attentive'}`] },
      rule: { title: deferred ? 'Retention policy' : decision.attention ? 'Capability negotiation' : 'Context decision', items: decision.attention ? [`base glance ${decision.attention.base} ms × modifier ${decision.attention.modifier} = ${decision.attention.effective} ms`, node.type === 'Alert' ? 'Critical Alert → safety-certified/eyes-free surfaces only' : 'Renderer eligible only if effective glance ≤ its budget', 'Use declared renderer order'] : deferred ? [`Disposition: ${decision.retention.disposition}`, `TTL: ${decision.retention.ttlMs} ms`, `Re-evaluate on: ${decision.retention.reevaluateOn.join(', ')}`] : [`Applicability: ${node.contextPolicy.applicability}`, `Blocked disposition: ${node.contextPolicy.onBlocked.disposition}`, `Decision: ${decision.outcome}`] },
      output: { title: decision.primary ? 'Render plan' : deferred ? 'Held semantic state' : 'No dispatch', items: decision.primary ? [`Primary: ${RENDERERS[decision.primary].label}`, `Concurrent: ${decision.concurrent.map((c) => RENDERERS[c].label).join(', ') || 'none'}`, `Rejected: ${decision.rejectedRenderers.map((r) => RENDERERS[r].label).join(', ') || 'none'}`] : deferred ? [`State: ${decision.retention.state}`, `Disposition: ${decision.retention.disposition}`, decision.retention.replaceExisting ? 'Newer value replaces older held value' : `Expires after ${decision.retention.ttlMs} ms`] : [`Outcome: ${decision.outcome}`, `Code: ${decision.auditCode}`, 'Primary: none'] },
      rationale: decision.reason,
      trace: { context: { vehicle_state: input.vehicleState, road_type: decision.attention?.roadType || input.roadType, driver_state: decision.attention?.driverState || input.driverState, effective_mode: decision.contextMode }, attention: decision.attention, capabilities: input.renderers, policy: { priority: decision.priority, applicability: node.contextPolicy.applicability, unknown_context: node.contextPolicy.unknownContext, on_blocked: node.contextPolicy.onBlocked, presentation_contract: node.presentationContract }, retention: decision.retention || null, render_plan: { primary: decision.primary, concurrent: decision.concurrent, rejected: decision.rejectedRenderers, delivery_success_policy: node.presentationContract.deliverySuccessPolicy } },
    },
    runtime: {
      icon: 'reply',
      question: 'How does one interaction stay consistent across outputs?',
      answer: deferred ? 'Runtime retains a semantic entry and waits for a context change; no occupant interaction is open yet.' : !decision.primary ? 'No interaction state is opened because nothing was dispatched.' : deliveryState === 'failed' ? 'The declared renderer-success policy was not satisfied, so occupant response never starts.' : !delivery?.delivered ? 'Runtime is waiting for authenticated renderer receipts before treating the interaction as presented.' : !responseRequired ? 'The delivery policy is satisfied; this node needs no occupant response and can close.' : ackState === 'acknowledged' ? 'The verified driver response closes the interaction.' : ackState === 'timed_out' ? 'The Coordination Runtime response timeout closes the interaction deterministically.' : 'Presentation is confirmed. Runtime now waits for the separate occupant response.',
      explanation: 'Coordination Runtime separates machine delivery receipts from human acknowledgement. A renderer first confirms received or presented; only then can an occupant response be meaningful.',
      input: { title: 'Render plan', items: [`Outputs: ${selected.map((s) => RENDERERS[s].label).join(' + ') || 'none'}`, `delivery policy: ${node.presentationContract.deliverySuccessPolicy}`, `delivery timeout: ${node.presentationContract.deliveryTimeoutMs} ms`, `occupant response: ${node.occupantResponse.kind}`, responseRequired ? `response timeout: ${node.occupantResponse.timeoutMs} ms` : 'response timeout: none'] },
      rule: { title: 'Coordinate two feedback loops', items: ['Dispatch one interaction ID', 'Evaluate renderer receipts against the declared success policy', 'Start occupant response only after delivery success', responseRequired ? `Accept verified input or close after ${node.occupantResponse.timeoutMs} ms` : 'Close after confirmed delivery', 'Keep all output state consistent'] },
      output: { title: 'Interaction state', items: [`Retention: ${decision.retention ? `${decision.retention.disposition} / ${decision.retention.state}` : 'none'}`, `Delivery: ${deliveryState}`, `Presented via: ${deliveryVia}`, `Occupant ACK: ${ackState}`, `Closed: ${interactionClosed}`, `Delivery audit: ${delivery?.auditCode || (decision.primary ? 'DELIVERY_PENDING' : 'DELIVERY_NOT_DISPATCHED')}`, `Occupant audit: ${ackAuditCode}`] },
      rationale: 'Delivery failure and human non-response have different causes and remediation. Keeping them separate makes fallback, timeout handling, and audit evidence unambiguous.',
      trace: { instance_state: deferred ? 'held' : decision.primary ? 'dispatched' : decision.outcome, focus_owner: decision.primary ? decision.nodeId : null, retention: decision.retention || null, delivery: { success_policy: node.presentationContract.deliverySuccessPolicy, timeout_ms: node.presentationContract.deliveryTimeoutMs, state: deliveryState, delivered: delivery?.delivered ?? false, delivered_via: delivery?.deliveredVia || [], receipts: delivery?.receipts || {}, audit_code: delivery?.auditCode || (decision.primary ? 'DELIVERY_PENDING' : 'DELIVERY_NOT_DISPATCHED') }, occupant_response: { kind: node.occupantResponse.kind, authority: node.occupantResponse.authority || null, timeout_ms: node.occupantResponse.timeoutMs || null, state: ackState, elapsed_ms: acknowledgement?.elapsedMs ?? null, audit_code: ackAuditCode }, closed: interactionClosed },
    },
    renderers: {
      icon: 'panels-top-left',
      question: 'What does the occupant actually receive?',
      answer: deferred ? 'Nothing is rendered yet; the retained state will be translated again when context becomes safe.' : !decision.primary ? 'Nothing reaches an occupant-facing surface.' : delivery?.delivered ? `${deliveryVia} confirmed that the interaction was presented.` : deliveryState === 'failed' ? 'The selected outputs did not confirm presentation.' : `${selected.map((item) => RENDERERS[item].label).join(' + ')} received a render request; presentation is not confirmed yet.`,
      explanation: 'Renderers remain external to SIA. They own visual and acoustic design, consume one constrained render plan, and return a machine delivery receipt distinct from any occupant response.',
      input: { title: 'Render plan', items: [`Primary: ${decision.primary ? RENDERERS[decision.primary].label : 'none'}`, `Concurrent: ${decision.concurrent.map((c) => RENDERERS[c].label).join(', ') || 'none'}`, 'Accessibility alternative available'] },
      rule: { title: 'Render and report', items: ['Preserve declared priority', 'Use renderer-native presentation', 'Return received when accepted', 'Return presented only after occupant-facing output succeeds', 'Return failed or allow runtime delivery timeout', responseRequired ? 'Expose a separate occupant-response affordance' : 'No occupant response needed'] },
      output: { title: 'Renderer receipts', items: selected.length ? allRenderers.map((name) => `${RENDERERS[name].label}: ${delivery?.receipts?.[name]?.state || (selected.includes(name) ? 'pending' : 'inactive')}`) : ['No render request', 'No delivery receipt', 'No occupant ACK expected'] },
      rationale: decision.primary ? 'A delivery receipt proves which renderer accepted and presented the interaction. It does not claim that the occupant noticed or understood it; that is tracked separately.' : deferred ? 'No render request exists yet, so the absence of a delivery receipt is intentional—not a delivery failure. The retained semantic state remains auditable.' : 'Fail-closed or context-dropped means an unsafe, unauthorised, or contextually inappropriate interaction remains invisible even if a renderer is technically available.',
      trace: { dispatch: Object.fromEntries(allRenderers.map((name) => [name, selected.includes(name) ? 'requested' : 'inactive'])), semantic_identity: decision.nodeId, delivery_receipts: delivery?.receipts || {}, delivery_channel: decision.primary ? 'renderer_to_runtime' : null, occupant_response_channel: decision.primary && responseRequired ? 'occupant_via_authenticated_input_to_runtime' : null },
    },
  };
}

/**
 * Reconciles machine-to-machine renderer receipts. `received` proves transport
 * acceptance; only `presented` proves that an occupant-facing output succeeded.
 * Human acknowledgement is coordinated separately below.
 */
export function coordinateDelivery(input, decision, delivery = {}) {
  if (!decision.primary) {
    return { state: 'not_dispatched', delivered: false, final: true, deliveredVia: [], fallbackUsed: false, receipts: {}, auditCode: 'DELIVERY_NOT_DISPATCHED' };
  }

  const selected = [decision.primary, ...decision.concurrent];
  const fallbackCandidates = decision.node.presentationContract.degradationPolicy === 'next_eligible'
    ? decision.node.presentationContract.preferredRenderers.filter((name) => {
    if (selected.includes(name) || !input.renderers?.[name]) return false;
    const budget = decision.attention?.budgets?.[name];
    return decision.node.type === 'Alert' ? ['cluster', 'voice'].includes(name) : Boolean(budget?.eligible);
      })
    : [];
  const tracked = [...new Set([...selected, ...fallbackCandidates])];
  const receipts = Object.fromEntries(tracked.map((name) => [name, normalizeDeliveryReceipt(delivery.receipts?.[name])]));
  const deliveredVia = tracked.filter((name) => receipts[name].state === 'presented');
  const primaryState = receipts[decision.primary].state;
  const deliveryPolicy = decision.node.presentationContract.deliverySuccessPolicy;
  const required = decision.node.presentationContract.requiredRenderers;
  const policySatisfied = deliveryPolicy === 'primary_presented'
    ? primaryState === 'presented'
    : deliveryPolicy === 'all_required_presented'
      ? required.length > 0 && required.every((name) => receipts[name]?.state === 'presented')
      : deliveredVia.length > 0;

  if (policySatisfied) {
    const fallbackUsed = primaryState !== 'presented';
    return {
      state: fallbackUsed ? 'fallback_presented' : 'presented',
      delivered: true,
      final: true,
      deliveredVia,
      fallbackUsed,
      receipts,
      successPolicy: deliveryPolicy,
      auditCode: fallbackUsed ? 'DELIVERY_FALLBACK_PRESENTED' : 'DELIVERY_PRESENTED',
    };
  }

  if (tracked.some((name) => receipts[name].state === 'received')) {
    return { state: 'received', delivered: false, final: false, deliveredVia: [], fallbackUsed: false, receipts, auditCode: 'DELIVERY_RECEIVED' };
  }

  const terminal = tracked.length > 0 && tracked.every((name) => ['presented', 'failed', 'timed_out'].includes(receipts[name].state));
  if (terminal) {
    return { state: 'failed', delivered: false, final: true, deliveredVia, fallbackUsed: false, receipts, successPolicy: deliveryPolicy, auditCode: 'DELIVERY_FAILED_POLICY' };
  }

  return { state: 'pending', delivered: false, final: false, deliveredVia: [], fallbackUsed: false, receipts, auditCode: 'DELIVERY_PENDING' };
}

function normalizeDeliveryReceipt(receipt) {
  const value = typeof receipt === 'string' ? { state: receipt } : (receipt || {});
  const state = ['pending', 'received', 'presented', 'failed', 'timed_out'].includes(value.state) ? value.state : 'pending';
  return { state, elapsedMs: Number.isFinite(value.elapsedMs) ? value.elapsedMs : null };
}

export function coordinateAcknowledgement(decision, ack = {}, delivery = null) {
  const node = decision.node;
  if (!requiresOccupantResponse(node)) {
    return { state: 'not_required', closed: true, auditCode: 'OCCUPANT_RESPONSE_NOT_REQUIRED' };
  }
  if (!decision.primary) {
    return { state: 'not_started', closed: true, elapsedMs: null, auditCode: 'OCCUPANT_RESPONSE_NOT_STARTED' };
  }
  if (delivery && !delivery.delivered) {
    return {
      state: 'not_started',
      closed: delivery.final,
      elapsedMs: null,
      auditCode: delivery.final ? 'OCCUPANT_RESPONSE_NOT_STARTED' : 'OCCUPANT_RESPONSE_NOT_STARTED',
    };
  }
  const timeout = node.occupantResponse.timeoutMs ?? 2000;
  if (ack.acknowledged) {
    return { state: 'acknowledged', closed: true, elapsedMs: ack.elapsedMs ?? 0, auditCode: 'OCCUPANT_ACKNOWLEDGED' };
  }
  if ((ack.elapsedMs ?? 0) >= timeout) {
    return { state: 'timed_out', closed: true, elapsedMs: ack.elapsedMs, auditCode: 'OCCUPANT_RESPONSE_TIMEOUT' };
  }
  return { state: 'pending', closed: false, elapsedMs: ack.elapsedMs ?? 0, remainingMs: timeout - (ack.elapsedMs ?? 0), auditCode: 'OCCUPANT_RESPONSE_PENDING' };
}
