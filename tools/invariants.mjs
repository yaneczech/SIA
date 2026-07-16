import { canonicalSha256 } from './canonical.mjs';

const roleOrder = ['driver', 'front_passenger', 'rear_passenger'];

function add(violations, code, condition, message) {
  if (!condition) violations.push({ code, message });
}

function uniqueBy(items, selector) {
  const values = items.map(selector);
  return new Set(values).size === values.length;
}

function targetRoleAllowed(declared, emitted) {
  return declared === 'any_occupant' ? [...roleOrder, 'any_occupant'].includes(emitted) : declared === emitted;
}

function artifactDigestMatches(artifact, expected) {
  return artifact && expected === canonicalSha256(artifact);
}

/**
 * Cross-artifact invariants that JSON Schema cannot express. Partial bundles
 * are supported so the CLI can validate one artifact against installed
 * repository dependencies; a complete lifecycle bundle enables causality
 * checks across dispatch, receipts, response, retention, and audit.
 */
export function collectInvariantViolations(bundle, options = {}) {
  const violations = [];
  const {
    catalog,
    actorRegistry,
    policy,
    instance,
    context,
    plan,
    attempts = [],
    receipts = [],
    response,
    retention,
    audit,
  } = bundle;
  const acceptedAtMs = options.acceptedAtMs ?? context?.captured_at_ms ?? plan?.created_at_ms ?? null;

  if (catalog) {
    add(violations, 'CATALOG_DUPLICATE_NODE_ID', uniqueBy(catalog.nodes || [], (node) => node.id), 'Catalog node IDs must be unique.');
    if (policy) {
      for (const node of catalog.nodes || []) {
        add(violations, 'DECLARATION_POLICY_REF_MISMATCH', node.context_policy?.policy_ref === policy.policy_id, `${node.id}: policy_ref does not resolve to the supplied policy.`);
        add(violations, 'DECLARATION_POLICY_DIGEST_MISMATCH', artifactDigestMatches(policy, node.context_policy?.policy_sha256), `${node.id}: policy_sha256 does not match the signed context policy.`);
      }
    }
  }

  if (actorRegistry) {
    add(violations, 'ACTOR_REGISTRY_DUPLICATE_CREDENTIAL_ID', uniqueBy(actorRegistry.credentials || [], (item) => item.credential_id), 'Actor credential IDs must be unique.');
    for (const credential of actorRegistry.credentials || []) {
      add(violations, 'ACTOR_CREDENTIAL_TIME_ORDER', credential.valid_from_ms < credential.valid_until_ms, `${credential.credential_id}: valid_from_ms must precede valid_until_ms.`);
    }
  }

  if (policy) {
    for (const axis of ['road_type', 'driver_state']) {
      const values = policy.attention_modifiers?.[axis];
      if (!values) continue;
      const known = Object.entries(values).filter(([key]) => key !== 'unknown').map(([, value]) => value);
      add(violations, 'POLICY_UNKNOWN_NOT_WORST_CASE', values.unknown >= Math.max(...known), `${axis}.unknown must be at least the strictest known attention modifier.`);
    }
  }

  const declaration = instance && catalog?.nodes?.find((node) => node.id === instance.node_id);
  if (instance) {
    add(violations, 'INSTANCE_UNKNOWN_NODE', Boolean(declaration), `No installed declaration exists for ${instance.node_id}.`);
    if (catalog) {
      add(violations, 'INSTANCE_CATALOG_VERSION_MISMATCH', instance.catalog_version === catalog.catalog_version, 'Instance catalog_version does not match the installed catalog.');
      add(violations, 'INSTANCE_CATALOG_DIGEST_MISMATCH', artifactDigestMatches(catalog, instance.catalog_sha256), 'Instance catalog_sha256 does not match the installed signed catalog.');
    }
    if (declaration) {
      add(violations, 'INSTANCE_DECLARATION_DIGEST_MISMATCH', artifactDigestMatches(declaration, instance.node_schema_sha256), 'Instance node_schema_sha256 does not match the installed declaration.');
      add(violations, 'INSTANCE_ACTOR_CLASS_NOT_PERMITTED', declaration.trust_requirements.permitted_actor_classes.includes(instance.attestation.actor_class), `Actor class ${instance.attestation.actor_class} is not permitted to emit ${declaration.id}.`);
      add(violations, 'INSTANCE_TARGET_ROLE_ESCALATION', targetRoleAllowed(declaration.target_role, instance.target_role), `Runtime target_role ${instance.target_role} is not permitted by declaration target_role ${declaration.target_role}.`);
      add(violations, 'INSTANCE_TIME_ORDER', instance.occurred_at_ms < instance.valid_until_ms, 'valid_until_ms must be later than occurred_at_ms.');
      add(violations, 'INSTANCE_VALIDITY_EXCEEDS_DECLARATION', instance.valid_until_ms <= instance.occurred_at_ms + declaration.semantic_validity_ms, 'Runtime semantic validity exceeds the declaration-owned maximum.');
      add(violations, 'INSTANCE_ATTESTATION_BEFORE_EVENT', instance.attestation.timestamp_ms >= instance.occurred_at_ms, 'Attestation timestamp cannot precede the event occurrence.');
      add(violations, 'INSTANCE_ATTESTATION_AFTER_VALIDITY', instance.attestation.timestamp_ms <= instance.valid_until_ms, 'Attestation timestamp cannot be later than semantic validity.');
      if (acceptedAtMs != null) {
        add(violations, 'INSTANCE_FROM_FUTURE', instance.attestation.timestamp_ms <= acceptedAtMs + 50, 'Attestation is beyond the permitted +50 ms clock skew.');
        add(violations, 'INSTANCE_INGRESS_STALE', acceptedAtMs - instance.attestation.timestamp_ms <= declaration.trust_requirements.max_ingress_age_ms + 50, 'Ingress age exceeds the declaration freshness window plus permitted skew.');
        add(violations, 'INSTANCE_EXPIRED', acceptedAtMs <= instance.valid_until_ms, 'Semantic validity had already elapsed at acceptance.');
      }
      if (policy) {
        add(violations, 'DECLARATION_POLICY_REF_MISMATCH', declaration.context_policy.policy_ref === policy.policy_id, 'Declaration policy_ref does not resolve to the supplied policy.');
        add(violations, 'DECLARATION_POLICY_DIGEST_MISMATCH', artifactDigestMatches(policy, declaration.context_policy.policy_sha256), 'Declaration policy_sha256 does not match the signed context policy.');
      }
    }

    if (actorRegistry) {
      const attestation = instance.attestation;
      add(violations, 'ACTOR_REGISTRY_VERSION_MISMATCH', attestation.actor_registry_version === actorRegistry.registry_version, 'Attestation actor_registry_version does not match the current registry.');
      add(violations, 'ACTOR_REGISTRY_DIGEST_MISMATCH', artifactDigestMatches(actorRegistry, attestation.actor_registry_sha256), 'Attestation actor_registry_sha256 does not match the current signed registry.');
      const credential = actorRegistry.credentials?.find((item) => item.credential_id === attestation.actor_credential_id);
      add(violations, 'ACTOR_CREDENTIAL_UNKNOWN', Boolean(credential), 'Referenced actor credential is not present in the current registry.');
      if (credential) {
        add(violations, 'ACTOR_CREDENTIAL_DIGEST_MISMATCH', artifactDigestMatches(credential, attestation.actor_credential_sha256), 'Actor credential digest does not match the current registry entry.');
        add(violations, 'ACTOR_IDENTITY_MISMATCH', credential.actor_id === attestation.actor_id && credential.actor_class === attestation.actor_class && credential.key_id === attestation.key_id, 'Attested actor identity, class, or key does not match the authority-issued credential.');
        add(violations, 'ACTOR_CREDENTIAL_REVOKED', credential.status === 'active', 'Actor credential is revoked.');
        if (acceptedAtMs != null) add(violations, 'ACTOR_CREDENTIAL_OUTSIDE_VALIDITY', credential.valid_from_ms <= acceptedAtMs && acceptedAtMs <= credential.valid_until_ms, 'Actor credential is not valid at acceptance time.');
      }
    }
  }

  if (context) {
    if (policy) {
      add(violations, 'CONTEXT_POLICY_REF_MISMATCH', context.policy_ref === policy.policy_id, 'Context policy_ref does not resolve to the supplied policy.');
      add(violations, 'CONTEXT_POLICY_VERSION_MISMATCH', context.policy_version === policy.policy_version, 'Context policy_version does not match the supplied policy.');
      add(violations, 'CONTEXT_POLICY_DIGEST_MISMATCH', artifactDigestMatches(policy, context.policy_sha256), 'Context policy_sha256 does not match the signed policy.');
    }
    for (const [axisName, observation] of Object.entries(context.axes || {})) {
      add(violations, 'CONTEXT_OBSERVATION_FROM_FUTURE', observation.observed_at_ms <= context.captured_at_ms, `${axisName}: observation is newer than its snapshot.`);
      const requirement = policy?.axis_requirements?.[axisName];
      if (requirement) {
        add(violations, 'CONTEXT_AXIS_STALE', context.captured_at_ms - observation.observed_at_ms <= requirement.max_age_ms, `${axisName}: observation exceeds max_age_ms.`);
        add(violations, 'CONTEXT_AXIS_LOW_CONFIDENCE', observation.confidence >= requirement.min_confidence, `${axisName}: confidence is below policy minimum.`);
        const unknown = observation.value === 'unknown' || (axisName === 'occupancy' && observation.occupied_roles.length === 0);
        if (unknown && requirement.unknown_handling === 'fail_closed') add(violations, 'CONTEXT_AXIS_UNKNOWN_FAIL_CLOSED', false, `${axisName}: unknown value requires fail_closed.`);
      }
    }
    const axes = context.axes || {};
    add(violations, 'CONTEXT_IMPOSSIBLE_CHARGING_MOTION', !(axes.energy_state?.value === 'charging' && axes.motion_state?.value === 'moving'), 'A vehicle cannot be both charging and moving in the minimal profile.');
    add(violations, 'CONTEXT_IMPOSSIBLE_PARKED_MOTION', !(axes.operating_mode?.value === 'parked' && axes.motion_state?.value === 'moving'), 'A parked vehicle cannot be moving.');
    add(violations, 'CONTEXT_IMPOSSIBLE_SERVICE_MOTION', !(axes.operating_mode?.value === 'service' && axes.motion_state?.value === 'moving'), 'A vehicle in service mode cannot be moving in the minimal profile.');
  }

  if (plan) {
    const selected = plan.selected || [];
    const rejected = plan.rejected || [];
    add(violations, 'PLAN_DUPLICATE_RENDERER', uniqueBy(selected, (item) => item.renderer_id), 'A renderer may appear only once in selected.');
    add(violations, 'PLAN_PRIMARY_COUNT', selected.filter((item) => item.role === 'primary').length === 1, 'A render plan must have exactly one primary renderer.');
    add(violations, 'PLAN_SELECTED_REJECTED_OVERLAP', !selected.some((item) => rejected.some((other) => other.renderer_id === item.renderer_id)), 'Selected and rejected renderer sets must be disjoint.');
    if (instance) {
      add(violations, 'PLAN_INSTANCE_MISMATCH', plan.instance_id === instance.instance_id, 'Render plan instance_id does not match the instance.');
      add(violations, 'PLAN_CATALOG_DIGEST_MISMATCH', plan.catalog_sha256 === instance.catalog_sha256, 'Render plan catalog digest differs from the verified instance.');
      add(violations, 'PLAN_DECLARATION_DIGEST_MISMATCH', plan.node_schema_sha256 === instance.node_schema_sha256, 'Render plan declaration digest differs from the verified instance.');
      add(violations, 'PLAN_AFTER_SEMANTIC_VALIDITY', plan.created_at_ms <= instance.valid_until_ms, 'Render plan was created after semantic validity elapsed.');
    }
    if (context) {
      add(violations, 'PLAN_CONTEXT_MISMATCH', plan.context_id === context.context_id, 'Render plan context_id does not match the decision snapshot.');
      add(violations, 'PLAN_BEFORE_CONTEXT', plan.created_at_ms >= context.captured_at_ms, 'Render plan predates the bound context snapshot.');
      add(violations, 'PLAN_POLICY_MISMATCH', plan.policy_ref === context.policy_ref && plan.policy_version === context.policy_version && plan.policy_sha256 === context.policy_sha256, 'Render plan policy binding differs from the context snapshot.');
      if (instance) {
        const occupied = context.axes?.occupancy?.occupied_roles || [];
        const targetPresent = instance.target_role === 'any_occupant' ? occupied.length > 0 : occupied.includes(instance.target_role);
        add(violations, 'PLAN_TARGET_NOT_OCCUPIED', targetPresent, `Target role ${instance.target_role} is not occupied in the bound context snapshot.`);
      }
    }
    if (catalog) {
      add(violations, 'PLAN_SPEC_VERSION_MISMATCH', plan.spec_version === catalog.spec_version, 'Render plan spec_version differs from the installed catalog.');
      add(violations, 'PLAN_PROFILE_VERSION_MISMATCH', plan.profile_version === catalog.profile_version, 'Render plan profile_version differs from the installed catalog.');
      add(violations, 'PLAN_CATALOG_VERSION_MISMATCH', plan.catalog_version === catalog.catalog_version, 'Render plan catalog_version differs from the installed catalog.');
      add(violations, 'PLAN_CATALOG_ARTIFACT_MISMATCH', artifactDigestMatches(catalog, plan.catalog_sha256), 'Render plan catalog_sha256 does not match the installed catalog.');
    }
    if (declaration) {
      add(violations, 'PLAN_DELIVERY_POLICY_OVERRIDE', plan.delivery_success_policy === declaration.presentation_contract.delivery_success_policy, 'Render plan overrides declaration-owned delivery_success_policy.');
      add(violations, 'PLAN_DELIVERY_TIMEOUT_OVERRIDE', plan.delivery_timeout_ms === declaration.presentation_contract.delivery_timeout_ms, 'Render plan overrides declaration-owned delivery_timeout_ms.');
      for (const renderer of declaration.presentation_contract.required_renderers) {
        add(violations, 'PLAN_REQUIRED_RENDERER_MISSING', selected.some((item) => item.renderer_id.includes(`.${renderer[0].toUpperCase()}${renderer.slice(1)}.`) || item.renderer_id.toLowerCase().includes(`.${renderer}.`)), `Required renderer kind ${renderer} is missing from the plan.`);
      }
    }
  }

  const attemptById = new Map(attempts.map((attempt) => [attempt.attempt_id, attempt]));
  add(violations, 'DISPATCH_DUPLICATE_ATTEMPT_ID', uniqueBy(attempts, (attempt) => attempt.attempt_id), 'Dispatch attempt IDs must be unique.');
  for (const attempt of attempts) {
    add(violations, 'DISPATCH_TIME_ORDER', attempt.dispatched_at_ms < attempt.deadline_at_ms, `${attempt.attempt_id}: dispatch deadline must follow dispatch.`);
    if (plan) {
      add(violations, 'DISPATCH_PLAN_MISMATCH', attempt.decision_id === plan.decision_id && attempt.instance_id === plan.instance_id, `${attempt.attempt_id}: dispatch does not bind the render plan.`);
      add(violations, 'DISPATCH_BEFORE_PLAN', attempt.dispatched_at_ms >= plan.created_at_ms, `${attempt.attempt_id}: dispatch predates the render plan.`);
      const availableWindow = instance ? instance.valid_until_ms - attempt.dispatched_at_ms : plan.delivery_timeout_ms;
      add(violations, 'DISPATCH_TIMEOUT_OVERRIDE', attempt.deadline_at_ms - attempt.dispatched_at_ms === Math.min(plan.delivery_timeout_ms, availableWindow), `${attempt.attempt_id}: dispatch deadline must use the plan timeout bounded by remaining semantic validity.`);
      add(violations, 'DISPATCH_RENDERER_NOT_SELECTED', plan.selected.some((item) => item.renderer_id === attempt.renderer_id && item.role === attempt.role), `${attempt.attempt_id}: renderer and role are not selected by the plan.`);
    }
    if (instance) add(violations, 'DISPATCH_AFTER_VALIDITY', attempt.deadline_at_ms <= instance.valid_until_ms, `${attempt.attempt_id}: dispatch deadline exceeds semantic validity.`);
    if (attempt.sequence === 0) add(violations, 'DISPATCH_FIRST_HAS_PREDECESSOR', attempt.previous_attempt_id === null, `${attempt.attempt_id}: first attempt must not have a predecessor.`);
    else {
      const predecessor = attemptById.get(attempt.previous_attempt_id);
      add(violations, 'DISPATCH_PREDECESSOR_UNKNOWN', Boolean(predecessor), `${attempt.attempt_id}: predecessor attempt is missing.`);
      add(violations, 'DISPATCH_FALLBACK_ROLE_REQUIRED', attempt.role === 'fallback', `${attempt.attempt_id}: a sequenced successor must have fallback role.`);
      if (predecessor) {
        const terminal = receipts.find((receipt) => receipt.attempt_id === predecessor.attempt_id && ['failed', 'timed_out'].includes(receipt.state));
        add(violations, 'DISPATCH_FALLBACK_BEFORE_FAILURE', Boolean(terminal) && terminal.observed_at_ms <= attempt.dispatched_at_ms, `${attempt.attempt_id}: fallback dispatch requires prior failed or timed-out receipt evidence.`);
      }
    }
  }

  const receiptById = new Map(receipts.map((receipt) => [receipt.receipt_id, receipt]));
  add(violations, 'RECEIPT_DUPLICATE_ID', uniqueBy(receipts, (receipt) => receipt.receipt_id), 'Delivery receipt IDs must be unique.');
  add(violations, 'RECEIPT_DUPLICATE_SEQUENCE', uniqueBy(receipts, (receipt) => `${receipt.attempt_id}:${receipt.receipt_sequence}`), 'Receipt sequence numbers must be unique within an attempt.');
  for (const receipt of receipts) {
    const attempt = attemptById.get(receipt.attempt_id);
    add(violations, 'RECEIPT_ATTEMPT_UNKNOWN', Boolean(attempt), `${receipt.receipt_id}: dispatch attempt is missing.`);
    if (!attempt) continue;
    add(violations, 'RECEIPT_BINDING_MISMATCH', receipt.decision_id === attempt.decision_id && receipt.instance_id === attempt.instance_id && receipt.renderer_id === attempt.renderer_id, `${receipt.receipt_id}: receipt does not bind its dispatch attempt.`);
    add(violations, 'RECEIPT_BEFORE_DISPATCH', receipt.observed_at_ms >= attempt.dispatched_at_ms, `${receipt.receipt_id}: receipt predates dispatch.`);
    add(violations, 'RECEIPT_ELAPSED_MISMATCH', receipt.elapsed_ms === receipt.observed_at_ms - attempt.dispatched_at_ms, `${receipt.receipt_id}: elapsed_ms does not match dispatch time.`);
    if (receipt.state === 'timed_out') add(violations, 'RECEIPT_TIMEOUT_MISMATCH', receipt.observed_at_ms === attempt.deadline_at_ms, `${receipt.receipt_id}: timeout must occur exactly at the attempt deadline.`);
    else add(violations, 'RECEIPT_AFTER_DEADLINE', receipt.observed_at_ms <= attempt.deadline_at_ms, `${receipt.receipt_id}: renderer receipt arrived after the attempt deadline.`);
  }
  for (const attempt of attempts) {
    const ordered = receipts.filter((receipt) => receipt.attempt_id === attempt.attempt_id).sort((a, b) => a.receipt_sequence - b.receipt_sequence);
    for (let index = 1; index < ordered.length; index += 1) {
      add(violations, 'RECEIPT_SEQUENCE_TIME_REGRESSION', ordered[index].observed_at_ms >= ordered[index - 1].observed_at_ms, `${attempt.attempt_id}: receipt time regresses as sequence increases.`);
      add(violations, 'RECEIPT_AFTER_TERMINAL_STATE', !['presented', 'failed', 'timed_out'].includes(ordered[index - 1].state), `${attempt.attempt_id}: a receipt follows a terminal delivery state.`);
    }
  }

  if (response) {
    const proofReceipts = response.delivery_receipt_ids.map((id) => receiptById.get(id));
    add(violations, 'RESPONSE_RECEIPT_UNKNOWN', proofReceipts.every(Boolean), 'Occupant response references an unknown delivery receipt.');
    add(violations, 'RESPONSE_RECEIPT_NOT_PRESENTED', proofReceipts.every((receipt) => receipt?.state === 'presented'), 'Occupant response must be opened from presented delivery evidence.');
    if (plan) add(violations, 'RESPONSE_BINDING_MISMATCH', response.decision_id === plan.decision_id && response.instance_id === plan.instance_id && response.context_id === plan.context_id, 'Occupant response does not bind the render decision.');
    const presentedAt = Math.max(...proofReceipts.filter(Boolean).map((receipt) => receipt.observed_at_ms));
    if (Number.isFinite(presentedAt)) add(violations, 'RESPONSE_OPENED_BEFORE_PRESENTATION', response.opened_at_ms >= presentedAt, 'Occupant response opened before delivery success was established.');
    if (declaration?.occupant_response.kind === 'explicit_or_timeout') add(violations, 'RESPONSE_DEADLINE_OVERRIDE', response.deadline_at_ms - response.opened_at_ms === declaration.occupant_response.timeout_ms, 'Occupant response deadline overrides the declaration timeout.');
    if (declaration) {
      const declaredAuthority = declaration.occupant_response.kind === 'explicit_or_timeout' ? declaration.occupant_response.authority : null;
      const authorityMatches = response.state === 'timed_out' ? response.authority === 'coordination_runtime' : response.authority === declaredAuthority;
      add(violations, 'RESPONSE_AUTHORITY_OVERRIDE', authorityMatches, 'Occupant response authority differs from the declaration-owned contract.');
    }
    add(violations, 'RESPONSE_TIME_ORDER', response.opened_at_ms <= response.occurred_at_ms && response.occurred_at_ms <= response.deadline_at_ms, 'Occupant response occurred outside its open response window.');
    if (response.state === 'timed_out') add(violations, 'RESPONSE_TIMEOUT_MISMATCH', response.occurred_at_ms === response.deadline_at_ms, 'Response timeout must occur exactly at its deadline.');
    if (response.authority === 'driver_only') add(violations, 'RESPONSE_DRIVER_AUTHORITY_MISMATCH', response.subject_role === 'driver', 'driver_only response must bind a driver input.');
    const occupied = context?.axes?.occupancy?.occupied_roles || [];
    if (response.subject_role !== 'coordination_runtime' && context) add(violations, 'RESPONSE_SUBJECT_NOT_OCCUPIED', occupied.includes(response.subject_role), 'Responding occupant role is not present in the bound context snapshot.');
  }

  if (retention) {
    add(violations, 'RETENTION_TIME_ORDER', retention.retained_at_ms < retention.valid_until_ms, 'Retention starts after semantic validity.');
    if (retention.expires_at_ms != null) add(violations, 'RETENTION_EXCEEDS_VALIDITY', retention.retained_at_ms < retention.expires_at_ms && retention.expires_at_ms <= retention.valid_until_ms, 'Retention expiry must be after retention and no later than semantic validity.');
    if (policy) add(violations, 'RETENTION_POLICY_MISMATCH', retention.policy_ref === policy.policy_id && retention.policy_version === policy.policy_version && artifactDigestMatches(policy, retention.policy_sha256), 'Retention record does not bind the active policy.');
    if (catalog) {
      const retainedDeclaration = catalog.nodes?.find((node) => node.id === retention.node_id);
      add(violations, 'RETENTION_CATALOG_VERSION_MISMATCH', retention.spec_version === catalog.spec_version && retention.profile_version === catalog.profile_version && retention.catalog_version === catalog.catalog_version, 'Retention record version binding differs from the installed catalog.');
      add(violations, 'RETENTION_CATALOG_DIGEST_MISMATCH', artifactDigestMatches(catalog, retention.catalog_sha256), 'Retention catalog digest does not match the installed catalog.');
      add(violations, 'RETENTION_UNKNOWN_NODE', Boolean(retainedDeclaration), `Retention node ${retention.node_id} is not in the installed catalog.`);
      if (retainedDeclaration) {
        add(violations, 'RETENTION_DECLARATION_DIGEST_MISMATCH', artifactDigestMatches(retainedDeclaration, retention.node_schema_sha256), 'Retention declaration digest does not match the installed node.');
        add(violations, 'RETENTION_DISPOSITION_OVERRIDE', retainedDeclaration.context_policy.on_blocked.disposition === retention.disposition, 'Retention disposition overrides the declaration.');
        const declaredTtl = retainedDeclaration.context_policy.on_blocked.ttl_ms;
        if (retention.expires_at_ms != null && declaredTtl != null) add(violations, 'RETENTION_TTL_OVERRIDE', retention.expires_at_ms - retention.retained_at_ms <= declaredTtl, 'Retention duration exceeds the declaration TTL.');
      }
    }
  }

  if (audit) {
    if (instance) {
      add(violations, 'AUDIT_INSTANCE_MISMATCH', audit.instance_id === instance.instance_id, 'Audit record binds the wrong instance.');
      add(violations, 'AUDIT_DECLARATION_DIGEST_MISMATCH', audit.node_schema_sha256 === instance.node_schema_sha256, 'Audit record declaration digest differs from the instance.');
      add(violations, 'AUDIT_CATALOG_DIGEST_MISMATCH', audit.catalog_sha256 === instance.catalog_sha256, 'Audit record catalog digest differs from the instance.');
    }
    if (catalog) add(violations, 'AUDIT_VERSION_MISMATCH', audit.spec_version === catalog.spec_version && audit.profile_version === catalog.profile_version && audit.catalog_version === catalog.catalog_version, 'Audit version binding differs from the installed catalog.');
    if (context && audit.context_id !== null) add(violations, 'AUDIT_CONTEXT_MISMATCH', audit.context_id === context.context_id, 'Audit record binds the wrong context snapshot.');
    if (policy) add(violations, 'AUDIT_POLICY_MISMATCH', audit.policy_ref === policy.policy_id && audit.policy_version === policy.policy_version && artifactDigestMatches(policy, audit.policy_sha256), 'Audit record does not bind the active policy.');
    const hashInput = structuredClone(audit);
    delete hashInput.record_sha256;
    add(violations, 'AUDIT_RECORD_DIGEST_MISMATCH', audit.record_sha256 === canonicalSha256(hashInput), 'Audit record_sha256 does not match its canonical content.');
    add(violations, 'AUDIT_CHAIN_POSITION_MISMATCH', (audit.sequence === 0) === (audit.previous_record_sha256 === null), 'Only the first audit record may omit its predecessor hash.');
  }

  return violations;
}

export function assertSiaInvariants(bundle, options = {}) {
  const violations = collectInvariantViolations(bundle, options);
  if (violations.length) {
    const error = new Error(violations.map((item) => `${item.code}: ${item.message}`).join('\n'));
    error.name = 'SiaInvariantError';
    error.violations = violations;
    throw error;
  }
}
