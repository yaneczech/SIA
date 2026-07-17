import { ACTOR_CLASS_IDS, CONTEXT_AXES, CONTEXT_POLICY, DOC_EXCERPTS, NODE_RECORDS, PROFILE_META, RENDERER_DECLARATIONS } from './generated-profile.js?v=0.4.1';

const ACTOR_LABELS = Object.freeze({
  human_direct: 'Driver (direct input)', adas: 'ADAS', service: 'Vehicle service', third_party_app: 'Third-party app', agent_local: 'In-vehicle AI assistant', agent_cloud: 'Cloud AI assistant',
});
const NODE_LABELS = Object.freeze({
  'Interaction.Event.Alert.Collision.Warning': 'Collision warning',
  'Interaction.Event.Alert.Lane.Departure.Warning': 'Lane departure warning',
  'Interaction.Event.Notification.Diagnostic.CollisionSensorTest': 'Collision-sensor diagnostic',
  'Interaction.Event.Notification.Media.NowPlaying': 'Now playing',
  'Interaction.Event.Notification.Assistant.Suggestion': 'Assistant suggestion',
});
const RENDERER_LABELS = Object.freeze({ cluster: 'Cluster', ivi: 'Center display', voice: 'Voice' });

export { CONTEXT_AXES, DOC_EXCERPTS, PROFILE_META };
export const ACTOR_CLASSES = ACTOR_CLASS_IDS.map((id) => ({ id, label: ACTOR_LABELS[id] || id }));
export const CONTEXT_MODIFIERS = CONTEXT_POLICY.attention_modifiers;
export const RENDERERS = Object.freeze(Object.fromEntries(RENDERER_DECLARATIONS.map((renderer) => [renderer.kind, {
  id: renderer.renderer_id,
  label: RENDERER_LABELS[renderer.kind] || renderer.kind,
  glanceOptimized: renderer.capabilities.glance_optimized,
  safetyProfile: renderer.kind === 'voice' ? 'audio_eyes_free' : renderer.safety_assurance.level === 'safety_relevant' ? 'safety_relevant_visual' : 'general_interactive_visual',
  maxGlanceBudgetMs: renderer.capabilities.max_glance_budget_ms ?? null,
  maxSimultaneousElements: renderer.capabilities.max_simultaneous_elements,
  textMaxChars: renderer.capabilities.text_max_chars ?? null,
}])));

const mapBlockedPolicy = (policy) => ({
  disposition: policy.disposition,
  ttlMs: policy.ttl_ms,
  coalescingKeyFields: policy.coalescing_key_fields,
  reevaluateOn: policy.reevaluate_on,
  onExpiry: policy.on_expiry,
  maxPending: policy.max_pending,
  maxPendingPerKey: policy.max_pending_per_key,
  auditRequired: policy.audit_required,
});

export const NODES = Object.freeze(Object.fromEntries(NODE_RECORDS.map(({ declaration: node, declaration_sha256: schemaDigest }) => [node.id, {
  type: node.inherits_from.split('.').at(-1),
  label: NODE_LABELS[node.id] || node.id,
  priority: node.priority,
  schemaDigest,
  semanticValidityMs: node.semantic_validity_ms,
  trustRequirements: { permittedActorClasses: node.trust_requirements.permitted_actor_classes, maxIngressAgeMs: node.trust_requirements.max_ingress_age_ms },
  contextPolicy: { policyRef: node.context_policy.policy_ref, policySha256: node.context_policy.policy_sha256, applicability: node.context_policy.applicability, unknownContext: node.context_policy.unknown_context, onBlocked: mapBlockedPolicy(node.context_policy.on_blocked) },
  presentationContract: { preferredRenderers: node.presentation_contract.preferred_renderers, requiredRenderers: node.presentation_contract.required_renderers, deliverySuccessPolicy: node.presentation_contract.delivery_success_policy, deliveryTimeoutMs: node.presentation_contract.delivery_timeout_ms, degradationPolicy: node.presentation_contract.degradation_policy },
  occupantResponse: { kind: node.occupant_response.kind, authority: node.occupant_response.authority, timeoutMs: node.occupant_response.timeout_ms },
  attention: { glanceTimeMs: node.attention_metrics.glance_time_estimated_ms, meanGlanceMs: node.attention_metrics.mean_single_glance_ms, taskSteps: node.attention_metrics.task_steps, voiceAlt: node.attention_metrics.voice_alt_available, cognitiveLoad: node.attention_metrics.cognitive_load },
  regulatoryBasis: node.regulatory_basis || [],
}])));

export const DEFAULT_NODE_ID = 'Interaction.Event.Alert.Collision.Warning';

export function resolveNode(nodeId) {
  return NODES[nodeId ?? DEFAULT_NODE_ID] || null;
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
  if (!node) {
    return {
      nodeId: input.nodeId,
      node: null,
      accepted: false,
      outcome: 'rejected',
      reason: `The node ${input.nodeId || '(missing)'} is not present in the installed catalog.`,
      checks: [check('unknown_node', 'Installed declaration', false, 'Unknown nodes fail closed and are never reinterpreted as a known interaction.')],
      priority: { declared: null, injected: input.injectedPriority || null, overridden: false, reservedFieldRejected: Boolean(input.injectedPriority) },
      contextMode: normalizeContext(input.vehicleState),
      context: deriveContextAxes(input.vehicleState),
      attention: null,
      primary: null,
      concurrent: [],
      rejectedRenderers: availableRenderers(input),
      auditCode: 'TRUST_REJECTED_UNKNOWN_NODE',
    };
  }
  const roadType = input.roadType || 'highway';
  const driverState = input.driverState || 'attentive';
  const observedDeclarationDigest = input.nodeSchemaDigest ?? node.schemaDigest;
  const acceptedAtMs = input.acceptedAtMs ?? 1784116800100;
  const occurredAtMs = input.occurredAtMs ?? acceptedAtMs - Math.max(input.ageMs ?? 0, 0);
  const validUntilMs = input.validUntilMs ?? occurredAtMs + node.semanticValidityMs;
  const semanticValidityOk = occurredAtMs < validUntilMs
    && validUntilMs <= occurredAtMs + node.semanticValidityMs
    && acceptedAtMs <= validUntilMs;

  const checks = [
    check('envelope', 'Closed runtime envelope', !input.injectedPriority, 'A runtime instance cannot override declaration-owned priority.'),
    check('declaration_digest', 'Declaration digest', observedDeclarationDigest === node.schemaDigest, 'The instance references a declaration that does not match the installed catalog.'),
    check('actor', 'Emitter authority', node.trustRequirements.permittedActorClasses.includes(input.actorClass), `${actorLabel(input.actorClass)} is not allowed to emit ${node.label}.`),
    check('signature', 'Digital signature', Boolean(input.signatureValid), 'The signature does not match.'),
    check('freshness', 'Ingress freshness', Number.isFinite(input.ageMs) && input.ageMs >= -50 && input.ageMs <= node.trustRequirements.maxIngressAgeMs, `The message age ${input.ageMs} ms is outside the permitted −50…${node.trustRequirements.maxIngressAgeMs} ms window.`),
    check('replay', 'Replay protection', !input.replayed, 'The same message has already been processed.'),
    check('revoked', 'Revocation status', !input.revoked, 'The actor key or session is revoked in the current authority registry.'),
    check('semantic_validity', 'Semantic validity', semanticValidityOk, 'The runtime validity is expired, reversed, or longer than the declaration permits.'),
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
      nodeId: input.nodeId,
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
      auditCode: ({ envelope: 'TRUST_REJECTED_ENVELOPE', declaration_digest: 'TRUST_REJECTED_DECLARATION_DIGEST', actor: 'TRUST_REJECTED_ACTOR', signature: 'TRUST_REJECTED_SIGNATURE', freshness: 'TRUST_REJECTED_FRESHNESS', replay: 'TRUST_REJECTED_REPLAY', revoked: 'TRUST_REJECTED_REVOKED', semantic_validity: 'TRUST_REJECTED_EXPIRED' })[failed.id],
    };
  }

  const contextMode = normalizeContext(input.vehicleState);
  const context = deriveContextAxes(input.vehicleState);
  const nodeId = input.nodeId;

  if (node.contextPolicy.applicability === 'moving_only' && context.motionState !== 'moving' && context.motionState !== 'unknown') {
    return {
      nodeId, node, accepted: true, outcome: 'not_applicable',
      reason: `${node.label} is meaningful only while the vehicle is moving. Motion is ${context.motionState}, so the instance closes as not applicable.`,
      checks, priority, contextMode, context, attention: null, primary: null, concurrent: [],
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
        checks, priority, contextMode, context, attention: null, primary: null, concurrent: [],
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
      checks, priority, contextMode, context, attention: null, primary: null, concurrent: [],
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
      if (node.presentationContract.preferredRenderers.includes(name)) {
        attention.budgets[name] = { eligible: true, reason: 'eligible declared fallback — standby until needed' };
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
      checks, priority, contextMode, context, attention, primary: null, concurrent: [],
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
      ? `${RENDERERS[primary].label} is the safest eligible primary surface for this interaction.`
      : `${node.presentationContract.preferredRenderers[0] === 'cluster' ? 'The cluster is offline.' : 'The preferred renderer is unavailable or over budget.'} SIA uses the next safe option in the declared renderer order: ${RENDERERS[primary].label}.`,
    checks, priority, contextMode, context, attention, primary, concurrent,
    rejectedRenderers,
    auditCode: isFirstChoice
      ? (concurrent.length ? 'PRIMARY_AND_CONCURRENT_SELECTED' : node.presentationContract.preferredRenderers.some((renderer) => renderer !== primary && input.renderers?.[renderer]) ? 'PRIMARY_WITH_FALLBACK_STANDBY' : 'PRIMARY_SELECTED')
      : 'FALLBACK_SELECTED',
  };
}

function check(id, label, passed, reason) {
  return { id, label, passed: Boolean(passed), reason: passed ? null : reason };
}

function normalizeContext(vehicleState) {
  if (vehicleState === 'unknown') return 'moving_strict';
  if (['charging', 'parked', 'service'].includes(vehicleState)) return 'stationary';
  return 'moving';
}

function deriveContextAxes(vehicleState) {
  if (vehicleState === 'charging') return { motionState: 'stationary', operatingMode: 'parked', energyState: 'charging' };
  if (vehicleState === 'parked') return { motionState: 'stationary', operatingMode: 'parked', energyState: 'not_charging' };
  if (vehicleState === 'service') return { motionState: 'stationary', operatingMode: 'service', energyState: 'not_charging' };
  if (vehicleState === 'unknown') return { motionState: 'unknown', operatingMode: 'unknown', energyState: 'unknown' };
  return { motionState: 'moving', operatingMode: 'driving', energyState: 'not_charging' };
}

function availableRenderers(input) {
  return Object.entries(input.renderers || {}).filter(([, available]) => available).map(([name]) => name);
}

function requiresOccupantResponse(node) {
  return node?.occupantResponse?.kind !== 'none';
}

function buildTimeSemantics(input, node, decision) {
  const acceptedAtMs = input.acceptedAtMs ?? 1784116800100;
  const ingressAgeMs = Number.isFinite(input.ageMs) ? input.ageMs : null;
  const attestedAtMs = ingressAgeMs == null ? null : acceptedAtMs - ingressAgeMs;
  const occurredAtMs = input.occurredAtMs ?? attestedAtMs ?? acceptedAtMs;
  const validUntilMs = input.validUntilMs ?? occurredAtMs + node.semanticValidityMs;
  const semanticRemainingMs = validUntilMs - acceptedAtMs;
  const declaredRetentionTtlMs = node.contextPolicy.onBlocked.ttlMs ?? null;
  const retentionActive = decision.retention?.state === 'held';
  const retentionDeadlineMs = retentionActive && declaredRetentionTtlMs != null
    ? Math.min(acceptedAtMs + declaredRetentionTtlMs, validUntilMs)
    : null;

  return {
    ingress_freshness: {
      attested_at_ms: attestedAtMs,
      accepted_at_ms: acceptedAtMs,
      ingress_age_ms: ingressAgeMs,
      max_ingress_age_ms: node.trustRequirements.maxIngressAgeMs,
      status: ingressAgeMs != null && ingressAgeMs <= node.trustRequirements.maxIngressAgeMs ? 'fresh' : 'stale',
    },
    semantic_validity: {
      occurred_at_ms: occurredAtMs,
      valid_until_ms: validUntilMs,
      semantic_validity_ms: node.semanticValidityMs,
      remaining_at_accept_ms: semanticRemainingMs,
      status: semanticRemainingMs >= 0 ? 'valid' : 'expired',
    },
    retention: {
      disposition: node.contextPolicy.onBlocked.disposition,
      active: retentionActive,
      retention_ttl_ms: declaredRetentionTtlMs,
      retained_at_ms: retentionActive ? acceptedAtMs : null,
      expires_at_ms: retentionDeadlineMs,
      effective_window_ms: retentionDeadlineMs == null ? null : retentionDeadlineMs - acceptedAtMs,
      bounded_by: retentionDeadlineMs == null ? null : retentionDeadlineMs === validUntilMs ? 'valid_until_ms' : 'retention_ttl_ms',
    },
  };
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
  const observedDeclarationDigest = input.nodeSchemaDigest || node.schemaDigest;
  const timeSemantics = buildTimeSemantics(input, node, decision);

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
        node_schema_sha256: observedDeclarationDigest,
        attestation: { actor_class: input.actorClass, signature_valid: input.signatureValid, age_ms: input.ageMs, replayed: input.replayed },
      },
    },
    trust: {
      icon: decision.accepted ? 'shield-check' : 'shield-x',
      question: 'Is this emitter allowed to say this?',
      answer: decision.accepted ? 'The node satisfies every declared trust requirement.' : `The node fails closed: ${decision.reason}`,
      explanation: 'Authentication alone is not enough. Trust Policy binds the instance to an installed declaration, then checks semantic authority, authenticity, freshness, replay, revocation, and validity before any renderer can see it.',
      input: { title: 'Node + attestation', items: [`Actor: ${actor}`, `Signature: ${input.signatureValid ? 'valid' : 'invalid'}`, `Declaration digest: ${observedDeclarationDigest === node.schemaDigest ? 'matches catalog' : 'mismatch'}`, `Ingress age: ${input.ageMs} ms`] },
      rule: { title: 'Verify all eight requirements', items: ['Closed envelope + node-specific payload schema', 'Declaration digest matches the installed catalog', `Actor class + identity permitted: [${node.trustRequirements.permittedActorClasses.join(', ')}]`, 'Signature or verified session authenticator is valid', `Ingress age ≤ ${node.trustRequirements.maxIngressAgeMs} ms`, 'Nonce has not been accepted before', 'Key and session revocation status is current', 'Semantic validity is open at acceptance'] },
      output: { title: decision.accepted ? 'Verified node' : 'Security rejection', items: decision.accepted ? ['Trust status: verified', 'Node may enter Translation', 'Provenance retained'] : [`Code: ${decision.auditCode}`, 'No renderer dispatch', 'Security event logged'] },
      rationale: decision.accepted ? 'All eight requirements are executable in the walkthrough. Binding the instance to the declaration and current authority state keeps priority, target, validity, and policy outside emitter control.' : 'A single failed requirement stops the interaction before translation. Criticality never overrides trust failure.',
      trace: { requirements: { closed_envelope_and_payload_schema: true, declaration_digest_required: true, permitted_actor_classes: node.trustRequirements.permittedActorClasses, signed_origin_required: true, max_ingress_age_ms: node.trustRequirements.maxIngressAgeMs, replay_protection: 'required', revocation_status: 'current', semantic_validity_at_acceptance: 'required' }, observed: { node_schema_sha256: observedDeclarationDigest, installed_declaration_sha256: node.schemaDigest, declaration_digest_matches: observedDeclarationDigest === node.schemaDigest, actor_class: input.actorClass, signature_valid: input.signatureValid, ingress_age_ms: input.ageMs, replayed: input.replayed, key_or_session_revoked: Boolean(input.revoked), semantic_validity_status: timeSemantics.semantic_validity.status, reserved_priority_field: input.injectedPriority || null }, executable_checks: checkSummary, decision: decision.accepted ? 'verified' : decision.auditCode },
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
      trace: { context: { motion_state: deriveContextAxes(input.vehicleState).motionState, operating_mode: deriveContextAxes(input.vehicleState).operatingMode, energy_state: deriveContextAxes(input.vehicleState).energyState, road_type: decision.attention?.roadType || input.roadType, driver_state: decision.attention?.driverState || input.driverState, effective_mode: decision.contextMode }, time_semantics: timeSemantics, attention: decision.attention, capabilities: input.renderers, policy: { policy_ref: node.contextPolicy.policyRef, policy_sha256: node.contextPolicy.policySha256, priority: decision.priority, applicability: node.contextPolicy.applicability, unknown_context: node.contextPolicy.unknownContext, on_blocked: node.contextPolicy.onBlocked, presentation_contract: node.presentationContract }, retention: decision.retention || null, render_plan: { primary: decision.primary, fallback_standby: node.presentationContract.preferredRenderers.filter((renderer) => renderer !== decision.primary && input.renderers?.[renderer]), concurrent: decision.concurrent, rejected: decision.rejectedRenderers, delivery_success_policy: node.presentationContract.deliverySuccessPolicy } },
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
      trace: { instance_state: deferred ? 'held' : decision.primary ? 'dispatched' : decision.outcome, focus_owner: decision.primary ? decision.nodeId : null, time_semantics: timeSemantics, retention: decision.retention || null, delivery: { success_policy: node.presentationContract.deliverySuccessPolicy, timeout_ms: node.presentationContract.deliveryTimeoutMs, state: deliveryState, delivered: delivery?.delivered ?? false, delivered_via: delivery?.deliveredVia || [], receipts: delivery?.receipts || {}, audit_code: delivery?.auditCode || (decision.primary ? 'DELIVERY_PENDING' : 'DELIVERY_NOT_DISPATCHED') }, occupant_response: { kind: node.occupantResponse.kind, authority: node.occupantResponse.authority || null, timeout_ms: node.occupantResponse.timeoutMs || null, state: ackState, elapsed_ms: acknowledgement?.elapsedMs ?? null, audit_code: ackAuditCode }, closed: interactionClosed },
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
