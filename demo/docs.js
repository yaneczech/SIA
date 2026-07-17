import { CONTEXT_AXES, DOC_EXCERPTS, evaluateInteraction, coordinateDelivery, coordinateAcknowledgement, RENDERERS, resolveNode } from './sia-engine.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
// Tolerates a stale-cache mismatch between docs.html and docs.js: a missing
// slot is skipped instead of crashing the whole render.
const setText = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };

const refreshIcons = () => window.lucide?.createIcons({ attrs: { width: 18, height: 18, 'stroke-width': 1.8 } });
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const collisionNode = resolveNode('Interaction.Event.Alert.Collision.Warning');

const highlightJson = (element, value) => {
  const plain = JSON.stringify(value, null, 2);
  const escaped = plain
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  element.innerHTML = escaped.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:|"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (token) => {
      let className = 'json-number';
      if (token.startsWith('"')) className = token.trimEnd().endsWith(':') ? 'json-key' : 'json-string';
      else if (token === 'true' || token === 'false') className = 'json-boolean';
      else if (token === 'null') className = 'json-null';
      return `<span class="${className}">${token}</span>`;
    },
  );
  element.dataset.copyValue = plain;
};

const lifecycle = [
  {
    kicker: 'PHASE 01 · ONTOLOGY',
    title: 'Declare the meaning once.',
    summary: 'Long before any warning fires, engineers write one small machine-readable card: what a collision warning means, who may send it, how urgent it is, where it may appear, and what must happen afterwards. That card is called a node—one entry in the vehicle’s dictionary of everything it is allowed to say to people.',
    story: `The card says: “A collision warning is critical. Only the driver-assistance system (ADAS) may send it. Trust Policy may accept it only while its ${collisionNode.trustRequirements.maxIngressAgeMs} ms ingress-freshness window and ${collisionNode.semanticValidityMs} ms semantic-validity window are both open. Once presentation succeeds, acknowledgement or a runtime timeout closes the ${collisionNode.occupantResponse.timeoutMs / 1000}-second response window.”`,
    why: 'Because the rules live on this card and shared policy—not inside each screen’s code—the mediation boundary evaluates the same rule set before any eligible output is asked to present. Nothing can talk its way into higher importance later: if the card says the priority, the priority is settled.',
    icon: 'book-open',
    outputBadge: 'Signed node declaration',
    inputTitle: 'Interaction intent',
    input: ['One stable semantic meaning', 'Target occupant role', 'Payload facts required to render'],
    ruleTitle: 'Declaration is authority',
    rules: ['Closed schema', 'Canonical digest binding', 'Policy is data—not runtime override'],
    outputTitle: 'Versioned semantic node',
    output: ['Trust requirements', 'Attention + context policy', 'Delivery + response contract'],
    codeIntro: 'This representative excerpt uses the format machines read (JSON). Don’t read every line—notice permitted_actor_classes: the complete list of who may send this warning, and priority, decided here, once.',
    codeLabel: 'collision-warning.node.json',
    code: null,
  },
  {
    kicker: 'PHASE 02 · EMITTER',
    title: 'Emit facts—not new authority.',
    summary: 'Now the moment happens: ADAS sees the gap to the car ahead closing fast. It writes one short message—“collision warning, 1.4 seconds to impact”—points it at the dictionary card by name, adds a timestamp and its cryptographic signature, and hands it to SIA.',
    story: 'The message carries only observed facts. It cannot ask for a bigger screen, a louder sound, or a higher priority—those fields simply do not exist in the message format.',
    why: 'A compromised or misbehaving system cannot smuggle authority into a message: any extra field makes the whole message invalid. Facts travel; power stays on the card.',
    icon: 'radio-tower',
    outputBadge: 'Attested runtime instance',
    inputTitle: 'Vehicle-system decision',
    input: ['Known node ID', 'Node-specific payload', 'Occurrence and validity window'],
    ruleTitle: 'Immutable identity',
    rules: ['Catalog + declaration digests bound', 'Actor credential bound', 'Nonce scoped to actor and key'],
    outputTitle: 'Signed occurrence',
    output: ['No priority override', 'No renderer request', 'No acknowledgement override'],
    codeIntro: 'An excerpt of the signed message. Notice what is missing: no priority, no screen choice, no styling. payload holds the measured facts; attestation holds the proof of who sent it and when.',
    codeLabel: 'collision-warning.instance.json',
    code: null,
  },
  {
    kicker: 'PHASE 03 · TRUST POLICY',
    title: 'Verify all eight trust requirements.',
    summary: `Before any screen even knows the message exists, SIA interrogates it: Is it well-formed? Does it reference the exact card we have installed? Is ADAS allowed to say this? Does the signature verify? Is its attestation-to-acceptance age within the declared ${collisionNode.trustRequirements.maxIngressAgeMs} ms window? Have we seen it before? Is the sender’s key still valid? Is the warning still meaningful right now?`,
    story: 'Eight questions, all mandatory. One “no” stops everything—the message never reaches a screen, no matter how urgent it claims to be.',
    why: 'Under the declared trust model, this gate makes a fake warning from a music app fail closed: a valid login is not enough, because authority to speak comes from the card, not from authentication alone. The full list of checks is explored one by one in section 02 below.',
    icon: 'shield-check',
    outputBadge: 'Verified or trust_rejected',
    inputTitle: 'Instance + trust stores',
    input: ['Signed runtime instance', 'Authenticated catalog', 'Current actor registry'],
    ruleTitle: 'Fail closed',
    rules: ['Every check is mandatory', 'Unknown nodes stay unknown', 'Signature alone is insufficient'],
    outputTitle: 'Trust decision',
    output: ['Stable reason code', 'Exact evidence digests', 'Audit on terminal rejection'],
    codeIntro: 'This teaching trace summarises the verifier’s eight answers; it is not an additional wire contract. Normative audit records use stable outcome codes to reconstruct why a message passed—or where it stopped.',
    codeLabel: 'trust-evaluation.trace.json',
    code: {
      state: 'verified',
      reason_code: 'TRUST_VERIFIED',
      checks: {
        envelope_and_payload: 'pass',
        declaration_digest: 'pass',
        actor_authority: 'pass',
        signature: 'pass',
        ingress_freshness: 'pass',
        nonce_replay: 'pass',
        revocation_status: 'pass',
        semantic_validity: 'pass',
      },
    },
  },
  {
    kicker: 'PHASE 04 · TRANSLATION + CONTEXT',
    title: 'Resolve applicability and eligible outputs.',
    summary: 'The warning is genuine—now where should it appear? SIA takes a signed snapshot of the situation (moving, highway, driver attentive) and matches the card’s requirements against what each output can prove about itself.',
    story: 'The instrument cluster has the required safety assurance and glance capability—selected. Voice—kept on standby. The center screen does not meet this warning’s declared safety profile—rejected, and the reason is written down.',
    why: 'The choice is deterministic: same inputs, same plan, every time. No screen improvises, every rejection has a recorded reason—that is what makes the behaviour certifiable and auditable.',
    icon: 'route',
    outputBadge: 'Deterministic render plan',
    inputTitle: 'Verified meaning + context',
    input: ['Immutable context snapshot', 'Signed context policy', 'Attested renderer capabilities'],
    ruleTitle: 'Meaning stays stable',
    rules: ['Applicability ≠ blocking', 'Unknown context never relaxes policy', 'Stable renderer tie-breaker'],
    outputTitle: 'Selected + rejected',
    output: ['Exactly one primary', 'Ordered fallbacks', 'Reason for every rejection'],
    codeIntro: 'The render plan. Both halves matter: selected says where the warning goes; rejected shows the center screen refused with a reason code—not silently skipped.',
    codeLabel: 'collision.render-plan.json',
    code: null,
  },
  {
    kicker: 'PHASE 05 · COORDINATION RUNTIME',
    title: 'Dispatch one ordered attempt at a time.',
    summary: 'SIA now asks the cluster to show the warning—one attempt at a time, each with its own deadline. If the cluster fails or stays silent past the deadline, the next attempt goes to voice.',
    story: 'The whole cascade must finish while the warning is still true: an expired warning is never sent anywhere.',
    why: 'Ordered attempts with deadlines mean a broken screen cannot silently swallow a critical warning. Every attempt is numbered and points to its predecessor, so the order is provable afterwards. SIA still assumes at-least-once transport, so deployments must prevent duplicate presentation where normal and fallback paths can overlap.',
    icon: 'send',
    outputBadge: 'Authenticated dispatch attempt',
    inputTitle: 'Render plan',
    input: ['Selected primary', 'Standby fallback', 'Delivery deadline'],
    ruleTitle: 'Causal ordering',
    rules: ['One attempt ID per dispatch', 'Fallback needs failed predecessor', 'Expired meaning is never dispatched'],
    outputTitle: 'Renderer request',
    output: ['Attempt sequence', 'Bound decision + instance', 'Authenticated runtime evidence'],
    codeIntro: 'One dispatch attempt. sequence and previous_attempt_id make the order provable; deadline_at_ms is bounded by the warning’s own expiry.',
    codeLabel: 'collision.dispatch-attempt.json',
    code: null,
  },
  {
    kicker: 'PHASE 06 · FEEDBACK + CLOSURE',
    title: 'Record delivery and occupant response separately.',
    summary: 'The cluster confirms: “presented, 72 ms after dispatch.” That machine receipt opens the 2-second window for the human. The driver presses the steering-wheel button—a separate, authenticated event.',
    story: 'Two different facts, never merged: the car showed the warning, and the driver answered it. If the driver does not respond, the timeout is recorded as the runtime’s own decision—the system never pretends a human acted.',
    why: 'Decision-relevant outcomes now sit in a tamper-evident audit chain: who sent what, what was verified, what was shown where, and whether an authorised occupant responded. After an incident, that chain answers questions no screenshot could reconstruct.',
    icon: 'reply',
    outputBadge: 'Receipt, response, and audit',
    inputTitle: 'Renderer + occupant evidence',
    input: ['Monotonic renderer receipt', 'Presented receipt IDs', 'Authenticated occupant input'],
    ruleTitle: 'Two independent claims',
    rules: ['Presentation ≠ awareness', 'Response binds opening receipts', 'Timeout is a runtime event'],
    outputTitle: 'Closed lifecycle',
    output: ['Delivery outcome', 'Occupant outcome', 'Hash-linked audit record'],
    codeIntro: 'A combined teaching view of two separate records: the renderer’s receipt and the occupant’s response. Each has its own authority and schema; neither can impersonate the other.',
    codeLabel: 'feedback-outcome.view.json',
    code: null,
  },
];

const trustChecks = [
  { title: 'Envelope + payload schema', short: 'Only declared fields', icon: 'file-check-2', stops: 'Priority, renderer, or policy injection', failure: 'TRUST_REJECTED_ENVELOPE', guarantee: 'Only schema-declared facts can enter semantic processing.', description: 'Reject unknown authority-changing fields and malformed node-specific payloads before semantic processing.' },
  { title: 'Declaration digest', short: 'Instance → exact node', icon: 'fingerprint', stops: 'Binding an instance to altered declaration rules', failure: 'TRUST_REJECTED_DECLARATION_DIGEST', guarantee: 'The runtime evaluates the exact installed declaration the instance names.', description: 'Compare the instance node digest with the canonical digest of the signed catalog declaration.' },
  { title: 'Actor authority', short: 'Class + identity permitted', icon: 'badge-check', stops: 'An app or assistant impersonating ADAS', failure: 'TRUST_REJECTED_ACTOR', guarantee: 'A credential proves identity and the declaration grants semantic authority.', description: 'Resolve the current credential and verify both actor identity and actor class against the node declaration.' },
  { title: 'Signature / authenticator', short: 'Origin evidence verifies', icon: 'key-round', stops: 'Tampering and unattributed emission', failure: 'TRUST_REJECTED_SIGNATURE', guarantee: 'The accepted bytes are attributable to the bound key or session.', description: 'Verify the configured algorithm over the RFC 8785 canonical signing representation.' },
  { title: 'Ingress freshness', short: 'Attestation is recent', icon: 'timer', stops: 'Delayed-but-still-signed messages', failure: 'TRUST_REJECTED_FRESHNESS', guarantee: 'Acceptance occurs inside the declaration-owned age limit.', description: 'Compare acceptance time with the signed attestation timestamp and max_ingress_age_ms; signing, HSM queueing, transport, validation, and verification after that timestamp all consume the window.' },
  { title: 'Nonce replay protection', short: 'Fresh message, first use', icon: 'copy-x', stops: 'Replaying a valid recent warning', failure: 'TRUST_REJECTED_REPLAY', guarantee: 'A nonce is unique per actor and key for the bounded replay window.', description: 'Check the scoped nonce cache. Cache overflow fails closed instead of forgetting earlier nonces.' },
  { title: 'Revocation status', short: 'Credential is current', icon: 'shield-x', stops: 'Use of a compromised or withdrawn credential', failure: 'TRUST_REJECTED_REVOKED', guarantee: 'A mathematically valid signature from a revoked key has no authority.', description: 'Evaluate current key and session status from the authenticated actor registry at acceptance time.' },
  { title: 'Semantic validity', short: 'Meaning has not expired', icon: 'hourglass', stops: 'Presenting facts that are no longer useful now', failure: 'TRUST_REJECTED_EXPIRED', guarantee: 'The interaction is accepted no later than its declaration-bounded expiry.', description: 'Verify valid_until_ms against occurrence, declaration maximum, acceptance time, and secure-time policy.' },
];

const contextCases = {
  collision: {
    status: 'APPLICABLE · NEVER BLOCK',
    title: 'The warning continues.',
    description: 'Another vehicle may reverse into a stationary or charging car. Charging must not suppress an external collision threat.',
    code: 'applicability: "always"',
    icon: 'shield-check',
    className: '',
  },
  lane: {
    status: 'NOT APPLICABLE',
    title: 'The instance closes without presentation.',
    description: 'A stationary vehicle cannot depart its lane. This meaning is irrelevant here—it is not temporarily suppressed or retained.',
    code: 'applicability: "moving_only"',
    icon: 'ban',
    className: 'is-not-applicable',
  },
};

const feedbackCases = {
  success: {
    primaryState: 'presented',
    primaryFailed: false,
    fallback: false,
    receipt: 'Machine evidence: cluster output was presented.',
    occupantTitle: 'Occupant acknowledged',
    occupantClaim: 'Separate authenticated human input.',
    occupantTimeout: false,
  },
  fallback: {
    primaryState: 'failed · terminal',
    primaryFailed: true,
    fallback: true,
    receipt: 'Primary failed; fallback voice output was presented.',
    occupantTitle: 'Occupant acknowledged',
    occupantClaim: 'The response binds the fallback presented receipt.',
    occupantTimeout: false,
  },
  'no-response': {
    primaryState: 'presented',
    primaryFailed: false,
    fallback: false,
    receipt: 'Machine evidence: cluster output was presented.',
    occupantTitle: 'Response timed out',
    occupantClaim: 'Runtime closed the wait; it did not invent a human action.',
    occupantTimeout: true,
  },
};

const contracts = {
  catalog: {
    kicker: 'AUTHORITY BUNDLE',
    title: 'Catalog manifest',
    description: 'The versioned, integrity-protected collection of semantic declarations installed for one SIA profile.',
    schema: 'catalog.schema.json', identity: 'catalog version + canonical SHA-256', owner: 'Catalog authority', file: 'catalog.json',
  },
  registry: {
    kicker: 'TRUST STORE',
    title: 'Actor registry',
    description: 'The current credential, actor-class, validity, and revocation authority used by the trust gate.',
    schema: 'actor-registry.schema.json', identity: 'registry version + credential ID', owner: 'Actor authority', file: 'actor-registry.json',
  },
  policy: {
    kicker: 'POLICY AUTHORITY',
    title: 'Context policy',
    description: 'Signed freshness, confidence, uncertainty, and attention rules for every independent context axis.',
    schema: 'context-policy.schema.json', identity: 'policy reference + canonical SHA-256', owner: 'Context Policy authority', file: 'core.context-policy.json',
  },
  node: {
    kicker: 'DECLARATION',
    title: 'Interaction node',
    description: 'The source of authority for meaning, trust, attention, context, delivery, and response behaviour.',
    schema: 'interaction-node.schema.json', identity: 'node ID + canonical SHA-256', owner: 'Catalog author', file: 'collision-warning.node.json',
  },
  instance: {
    kicker: 'EMISSION',
    title: 'Runtime instance',
    description: 'One immutable occurrence containing observed facts, exact declaration bindings, a validity window, and actor attestation.',
    schema: 'runtime-instance.schema.json', identity: 'instance_id + node digest', owner: 'Authorised emitter', file: 'collision-warning.instance.json',
  },
  context: {
    kicker: 'DECISION INPUT',
    title: 'Context snapshot',
    description: 'A signed, immutable set of orthogonal observations. Each axis carries its own source, timestamp, and confidence.',
    schema: 'context-snapshot.schema.json', identity: 'context_id + policy digest', owner: 'Vehicle Context Authority', file: 'context-attentive.json',
  },
  renderer: {
    kicker: 'CAPABILITY EVIDENCE',
    title: 'Renderer capability',
    description: 'An attested statement of what one output can safely present, including its assurance and glance constraints.',
    schema: 'renderer-capability.schema.json', identity: 'renderer ID + capability version', owner: 'Renderer registry', file: 'cluster.renderer.json',
  },
  retention: {
    kicker: 'BOUNDED RUNTIME STATE',
    title: 'Retention record',
    description: 'Evidence that an applicable interaction was dropped, held, coalesced, superseded, expired, or released under declaration-owned policy.',
    schema: 'retention-record.schema.json', identity: 'retention ID + bound instance', owner: 'Coordination Runtime', file: 'now-playing.retention-record.json',
  },
  plan: {
    kicker: 'TRANSLATION OUTPUT',
    title: 'Render plan',
    description: 'A deterministic, context-bound choice of one primary, optional fallbacks, and stable reasons for every rejected renderer.',
    schema: 'render-plan.schema.json', identity: 'decision_id + bound inputs', owner: 'Translation Layer', file: 'collision.render-plan.json',
  },
  dispatch: {
    kicker: 'DELIVERY INPUT',
    title: 'Dispatch attempt',
    description: 'An authenticated, causally ordered request to one renderer with a deadline bounded by semantic validity.',
    schema: 'dispatch-attempt.schema.json', identity: 'attempt_id + predecessor', owner: 'Coordination Runtime', file: 'collision.dispatch-attempt.json',
  },
  receipt: {
    kicker: 'MACHINE FEEDBACK',
    title: 'Delivery receipt',
    description: 'Renderer evidence for received, presented, or failed output—or a runtime-issued delivery timeout.',
    schema: 'delivery-receipt.schema.json', identity: 'receipt_id + attempt sequence', owner: 'Renderer or runtime', file: 'collision.delivery-receipt.json',
  },
  response: {
    kicker: 'HUMAN FEEDBACK',
    title: 'Occupant response',
    description: 'A separate response bound to the decision, context, and presented receipt IDs that opened the response window.',
    schema: 'occupant-response.schema.json', identity: 'response_id + presented receipts', owner: 'Input authority or runtime', file: 'collision.occupant-response.json',
  },
  audit: {
    kicker: 'TERMINAL EVIDENCE',
    title: 'Audit record',
    description: 'A hash-linked outcome record binding the exact instance, declaration, catalog, policy, context, phase, and stable reason code.',
    schema: 'audit-record.schema.json', identity: 'event ID + sequence + previous hash', owner: 'Coordination Runtime', file: 'collision.audit-record.json',
  },
};

// Documentation metadata above controls teaching labels and descriptions.
// Every machine-readable value comes from a deterministic excerpt generated
// from the signed examples; no hand-copied contract value exists here.
for (const [name, value] of Object.entries(DOC_EXCERPTS)) {
  if (contracts[name]) contracts[name].value = value;
}
lifecycle[0].code = DOC_EXCERPTS.node;
lifecycle[1].code = DOC_EXCERPTS.instance;
lifecycle[3].code = DOC_EXCERPTS.plan;
lifecycle[4].code = DOC_EXCERPTS.dispatch;
lifecycle[5].code = { delivery: DOC_EXCERPTS.receipt, occupant_response: DOC_EXCERPTS.response };

const renderList = (selector, items) => {
  const el = $(selector);
  if (el) el.innerHTML = items.map((item) => `<li>${item}</li>`).join('');
};

const renderLifecycle = (index, moveFocus = false) => {
  const item = lifecycle[index];
  const tabs = $$('[data-lifecycle-step]');
  tabs.forEach((tab, tabIndex) => {
    const selected = tabIndex === index;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  $('#lifecycle-panel').setAttribute('aria-labelledby', tabs[index].id);
  if (moveFocus) tabs[index].focus();
  $('#phase-icon').innerHTML = `<i data-lucide="${item.icon}" aria-hidden="true"></i>`;
  setText('#phase-kicker', item.kicker);
  setText('#phase-title', item.title);
  setText('#phase-summary', item.summary);
  setText('#phase-story', item.story);
  setText('#phase-why', item.why);
  setText('#phase-code-intro', item.codeIntro);
  setText('#phase-output-badge', item.outputBadge);
  setText('#phase-input-title', item.inputTitle);
  setText('#phase-rule-title', item.ruleTitle);
  setText('#phase-output-title', item.outputTitle);
  renderList('#phase-input-list', item.input);
  renderList('#phase-rule-list', item.rules);
  renderList('#phase-output-list', item.output);
  setText('#phase-code-label', item.codeLabel);
  highlightJson($('#phase-code'), item.code);
  refreshIcons();
};

$$('[data-lifecycle-step]').forEach((button, index, tabs) => {
  button.addEventListener('click', () => renderLifecycle(index));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    renderLifecycle(next, true);
  });
});

const buildTrustList = () => {
  $('#trust-list').innerHTML = trustChecks.map((item, index) => `
  <li>
    <button type="button" data-trust-check="${index}" aria-pressed="${index === 0}" aria-controls="trust-detail">
      <span>${String(index + 1).padStart(2, '0')}</span>
      <span><b>${item.title}</b><small>${item.short}</small></span>
      <i data-lucide="chevron-right" aria-hidden="true"></i>
    </button>
  </li>
`).join('');
  $$('[data-trust-check]').forEach((button) => button.addEventListener('click', () => renderTrust(Number(button.dataset.trustCheck))));
};

const renderTrust = (index) => {
  const item = trustChecks[index];
  $$('[data-trust-check]').forEach((button, buttonIndex) => button.setAttribute('aria-pressed', String(buttonIndex === index)));
  $('#trust-number').textContent = String(index + 1).padStart(2, '0');
  $('#trust-icon').innerHTML = `<i data-lucide="${item.icon}" aria-hidden="true"></i>`;
  $('#trust-title').textContent = item.title;
  $('#trust-description').textContent = item.description;
  $('#trust-stops').textContent = item.stops;
  $('#trust-failure').innerHTML = `<code>${item.failure}</code>`;
  $('#trust-guarantee').textContent = item.guarantee;
  refreshIcons();
};


const renderContext = (caseName) => {
  const item = contextCases[caseName];
  $$('[data-context-case]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.contextCase === caseName)));
  const result = $('#context-result');
  result.className = `context-result ${item.className}`.trim();
  $('.result-icon', result).innerHTML = `<i data-lucide="${item.icon}" aria-hidden="true"></i>`;
  $('#context-status').textContent = item.status;
  $('#context-title').textContent = item.title;
  $('#context-description').textContent = item.description;
  $('#context-code').textContent = item.code;
  refreshIcons();
};

$$('[data-context-case]').forEach((button) => button.addEventListener('click', () => renderContext(button.dataset.contextCase)));

const renderFeedback = (caseName) => {
  const item = feedbackCases[caseName];
  $$('[data-feedback-case]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.feedbackCase === caseName)));
  $('#primary-renderer').classList.toggle('is-failed', item.primaryFailed);
  $('#primary-state').textContent = item.primaryState;
  $('#fallback-forward').hidden = !item.fallback;
  $('#fallback-renderer').hidden = !item.fallback;
  $('#receipt-claim').textContent = item.receipt;
  $('#occupant-result').textContent = item.occupantTitle;
  $('#occupant-claim').textContent = item.occupantClaim;
  $('.occupant-return').classList.toggle('is-timeout', item.occupantTimeout);
  $('#dispatch-label').textContent = 'attempt 1 · primary';
};

$$('[data-feedback-case]').forEach((button) => button.addEventListener('click', () => renderFeedback(button.dataset.feedbackCase)));

const renderContract = (name, moveFocus = false) => {
  const item = contracts[name];
  const tabs = $$('[data-contract]');
  const activeTab = tabs.find((tab) => tab.dataset.contract === name);
  tabs.forEach((tab) => {
    const selected = tab === activeTab;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  $('#contract-panel').setAttribute('aria-labelledby', activeTab.id);
  if (moveFocus) activeTab.focus();
  $('#contract-kicker').textContent = item.kicker;
  $('#contract-title').textContent = item.title;
  $('#contract-description').textContent = item.description;
  $('#contract-schema').textContent = item.schema;
  $('#contract-identity').textContent = item.identity;
  $('#contract-owner').textContent = item.owner;
  $('#contract-file').textContent = item.file;
  highlightJson($('#contract-code'), item.value);
};

$$('[data-contract]').forEach((button, index, tabs) => {
  button.addEventListener('click', () => renderContract(button.dataset.contract));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const forward = ['ArrowDown', 'ArrowRight'].includes(event.key);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (forward ? 1 : -1) + tabs.length) % tabs.length;
    renderContract(tabs[nextIndex].dataset.contract, true);
  });
});

const copyText = async (text, button) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const temporary = document.createElement('textarea');
    temporary.value = text;
    temporary.setAttribute('readonly', '');
    temporary.style.position = 'fixed';
    temporary.style.opacity = '0';
    document.body.append(temporary);
    temporary.select();
    document.execCommand('copy');
    temporary.remove();
  }
  const oldLabel = button.innerHTML;
  button.innerHTML = '<i data-lucide="check" aria-hidden="true"></i> Copied';
  refreshIcons();
  window.setTimeout(() => {
    button.innerHTML = oldLabel;
    refreshIcons();
  }, 1400);
};

$$('[data-copy-target]').forEach((button) => button.addEventListener('click', () => {
  const target = document.getElementById(button.dataset.copyTarget);
  copyText(target.dataset.copyValue || target.textContent, button);
}));
$$('[data-copy-text]').forEach((button) => button.addEventListener('click', () => copyText(button.dataset.copyText, button)));

const setReadingMode = (mode) => {
  document.body.classList.toggle('mode-essential', mode === 'essential');
  $$('[data-reading-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.readingMode === mode)));
  try { localStorage.setItem('sia-docs-reading-mode', mode); } catch { /* storage is optional */ }
};

$$('[data-reading-mode]').forEach((button) => button.addEventListener('click', () => setReadingMode(button.dataset.readingMode)));

const sidebar = $('#docs-sidebar');
const scrim = $('#sidebar-scrim');
const menuButton = $('#menu-button');
const mobileSidebar = window.matchMedia('(max-width: 900px)');
const closeSidebar = ({ restoreFocus = true } = {}) => {
  const focusWasInside = sidebar.contains(document.activeElement);
  sidebar.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  scrim.hidden = true;
  document.body.classList.remove('is-menu-open');
  if (mobileSidebar.matches) sidebar.inert = true;
  if (restoreFocus && focusWasInside) menuButton.focus();
};
const openSidebar = () => {
  sidebar.inert = false;
  sidebar.classList.add('is-open');
  menuButton.setAttribute('aria-expanded', 'true');
  scrim.hidden = false;
  document.body.classList.add('is-menu-open');
  $('#docs-search').focus();
};

const syncSidebarAvailability = () => {
  if (mobileSidebar.matches) {
    sidebar.inert = !sidebar.classList.contains('is-open');
    return;
  }
  sidebar.inert = false;
  sidebar.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  scrim.hidden = true;
  document.body.classList.remove('is-menu-open');
};
syncSidebarAvailability();
mobileSidebar.addEventListener('change', syncSidebarAvailability);

menuButton.addEventListener('click', () => sidebar.classList.contains('is-open') ? closeSidebar() : openSidebar());
scrim.addEventListener('click', closeSidebar);
$$('.section-nav a').forEach((link) => link.addEventListener('click', closeSidebar));

const searchInput = $('#docs-search');
const searchableSections = $$('.docs-section[data-search]');
const faqItems = $$('#faq .faq-item');
let faqOpenStateBeforeSearch = null;
const updateSearch = () => {
  const query = searchInput.value.trim().toLowerCase();
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length > 0 && faqOpenStateBeforeSearch === null) faqOpenStateBeforeSearch = faqItems.map((item) => item.open);
  if (tokens.length === 0 && faqOpenStateBeforeSearch !== null) {
    faqItems.forEach((item, index) => { item.open = faqOpenStateBeforeSearch[index]; });
    faqOpenStateBeforeSearch = null;
  } else if (tokens.length > 0) {
    const matchingFaqItems = faqItems.filter((item) => {
      const text = item.textContent.toLowerCase();
      return tokens.every((token) => text.includes(token));
    });
    if (matchingFaqItems.length > 0) faqItems.forEach((item) => { item.open = matchingFaqItems.includes(item); });
  }
  let visible = 0;
  searchableSections.forEach((section) => {
    const haystack = `${section.dataset.search} ${section.textContent}`.toLowerCase();
    const matches = tokens.length === 0 || tokens.every((token) => haystack.includes(token));
    section.hidden = !matches;
    visible += Number(matches);
    const nav = $(`[data-nav-section="${section.id}"]`);
    if (nav) nav.hidden = !matches;
  });
  $('#search-empty').hidden = visible !== 0;
  $('.docs-cta').hidden = tokens.length > 0;
  $('.docs-footer').hidden = tokens.length > 0;
};
searchInput.addEventListener('input', updateSearch);
$('#clear-search').addEventListener('click', () => {
  searchInput.value = '';
  updateSearch();
  searchInput.focus();
});

document.addEventListener('keydown', (event) => {
  const isFormField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (event.key === '/' && !isFormField) {
    event.preventDefault();
    if (mobileSidebar.matches && !sidebar.classList.contains('is-open')) openSidebar();
    else searchInput.focus();
  }
  if (event.key === 'Escape') {
    if (sidebar.classList.contains('is-open')) closeSidebar();
    else if (searchInput.value) {
      searchInput.value = '';
      updateSearch();
      searchInput.focus();
    }
  }
});

const navLinks = $$('.section-nav a');
const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  navLinks.forEach((link) => link.classList.toggle('is-active', link.dataset.navSection === visible.target.id));
}, { rootMargin: '-18% 0px -67% 0px', threshold: [0, .15, .45] });
searchableSections.forEach((section) => observer.observe(section));

// --- Localisation ---------------------------------------------------------
// English lives in this file and in docs.html. A translation is one JSON file
// in ./i18n/ (see i18n/README.md): "selectors" overrides static page text by
// CSS selector, "data" deep-merges over the dynamic content above. Any key a
// translation omits silently keeps its English text.
const deepMerge = (target, patch) => {
  if (patch === null || typeof patch !== 'object') return patch;
  if (typeof target !== 'object' || target === null) return patch;
  for (const [key, value] of Object.entries(patch)) target[key] = deepMerge(target[key], value);
  return target;
};

const localizableData = { lifecycle, trustChecks, contextCases, feedbackCases, contracts };

const detectLocale = () => {
  const fromQuery = new URLSearchParams(location.search).get('lang');
  if (fromQuery) {
    try { localStorage.setItem('sia-docs-lang', fromQuery); } catch { /* storage is optional */ }
    return fromQuery;
  }
  try { return localStorage.getItem('sia-docs-lang') || 'en'; } catch { return 'en'; }
};

const applyLocale = async () => {
  const locale = detectLocale().toLowerCase();
  if (!/^[a-z]{2}(-[a-z0-9]+)?$/.test(locale) || locale === 'en') return;
  try {
    const response = await fetch(`./i18n/docs.${locale}.json`);
    if (!response.ok) return;
    const dictionary = await response.json();
    for (const [selector, text] of Object.entries(dictionary.selectors || {})) {
      const element = document.querySelector(selector);
      if (element) element.textContent = text;
    }
    for (const [name, patch] of Object.entries(dictionary.data || {})) {
      if (localizableData[name]) deepMerge(localizableData[name], patch);
    }
    document.documentElement.lang = dictionary.lang || locale;
  } catch { /* untranslated keys keep their English text */ }
};

let storedMode = 'essential';
try { storedMode = localStorage.getItem('sia-docs-reading-mode') || 'essential'; } catch { /* storage is optional */ }
setReadingMode(storedMode === 'technical' ? 'technical' : 'essential');
// --- Architecture explorer (engine-bound, replaces the static figures) ----
// The six core context axes are the source of truth for the diagram; the
// architecture.test.mjs suite asserts these match the context-snapshot schema.
const ARCH_SCENARIO = { nodeId: 'Interaction.Event.Alert.Collision.Warning', actorClass: 'adas', signatureValid: true, ageMs: 80, replayed: false, vehicleState: 'moving', roadType: 'highway', driverState: 'attentive', renderers: { cluster: true, voice: true, ivi: true } };
let archToken = 0;

const archLabel = (name) => RENDERERS[name]?.label || name;

function buildArchitecture() {
  const axes = $('#arch-axes');
  if (axes) axes.innerHTML = CONTEXT_AXES.map((axis) => `<li>${axis}</li>`).join('');
  const trustCount = $('#arch-trust-count');
  if (trustCount) trustCount.textContent = `${trustChecks.length} checks · fail-closed`;
  const surfaces = $('#arch-surfaces');
  if (surfaces) surfaces.innerHTML = Object.keys(RENDERERS).map((name) => `<li data-arch-surface="${name}">${archLabel(name)}</li>`).join('');
}

function resetArchitecture() {
  archToken += 1;
  $$('#arch-stage [data-arch-node]').forEach((node) => node.classList.remove('is-active', 'is-pass', 'is-fail'));
  $$('#arch-stage [data-arch-surface]').forEach((li) => li.classList.remove('is-selected'));
  $$('#arch-stage .arch-wire').forEach((w) => w.classList.remove('is-live'));
  const setState = (key, text) => { const el = $(`[data-arch-state="${key}"]`); if (el) el.textContent = text; };
  setState('emitter', 'idle');
  ['trust', 'context', 'translation', 'runtime', 'renderers'].forEach((k) => setState(k, 'waiting'));
  setState('receipt', 'machine evidence — awaiting run');
  setState('occupant', 'separate human evidence — awaiting run');
}

async function runArchitecture() {
  const token = ++archToken;
  const reduce = prefersReducedMotion();
  const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
  const button = $('#arch-run');
  const status = $('#arch-status');
  const stage = $('#arch-stage');
  if (!stage) return;

  resetArchitecture();
  archToken = token; // resetArchitecture bumped it; re-claim this run
  if (button) button.disabled = true;

  const node = resolveNode(ARCH_SCENARIO.nodeId);
  const decision = evaluateInteraction(ARCH_SCENARIO);
  const selected = decision.primary ? [decision.primary, ...decision.concurrent] : [];
  const receipts = Object.fromEntries(selected.map((name) => [name, { state: 'presented', elapsedMs: name === 'cluster' ? 72 : 90 }]));
  const delivery = coordinateDelivery(ARCH_SCENARIO, decision, { receipts });
  const ack = coordinateAcknowledgement(decision, { acknowledged: true, elapsedMs: 620 }, delivery);

  const setState = (key, text) => { const el = $(`[data-arch-state="${key}"]`); if (el) el.textContent = text; };
  const light = (nodeName, cls, ms) => wait(ms).then(() => {
    if (token !== archToken) return;
    const el = $(`#arch-stage [data-arch-node="${nodeName}"]`);
    if (el) { el.classList.add('is-active'); if (cls) el.classList.add(cls); }
  });

  const steps = [
    () => { setState('emitter', `emits ${node.label}`); light('emitter', 'is-pass', 0); if (status) status.textContent = `${node.label}: ADAS emits a signed instance.`; $('.arch-wire-in')?.classList.add('is-live'); },
    () => { setState('trust', decision.accepted ? `verified · ${trustChecks.length}/${trustChecks.length}` : 'rejected'); light('trust', decision.accepted ? 'is-pass' : 'is-fail', 0); if (status) status.textContent = `Trust Policy: ${decision.accepted ? `all ${trustChecks.length} checks pass` : decision.auditCode}.`; },
    () => { setState('context', `${decision.context.motionState} · applicable`); light('context', 'is-pass', 0); if (status) status.textContent = `Context: ${CORE_AXES.length} signed axes — applicable while ${decision.context.motionState}.`; },
    () => { setState('translation', decision.primary ? `${decision.auditCode}` : decision.auditCode); light('translation', decision.primary ? 'is-pass' : 'is-fail', 0); if (status) status.textContent = `Translation: primary ${archLabel(decision.primary)}${decision.concurrent.length ? ` + ${decision.concurrent.map(archLabel).join(', ')}` : ''}.`; $('.arch-wire-out')?.classList.add('is-live'); },
    () => { setState('runtime', 'ordered dispatch'); light('runtime', 'is-pass', 0); if (status) status.textContent = 'Coordination Runtime dispatches one deadline-bounded attempt.'; },
    () => { light('renderers', 'is-pass', 0); selected.forEach((name) => $(`[data-arch-surface="${name}"]`)?.classList.add('is-selected')); setState('renderers', `presented: ${selected.map(archLabel).join(' + ') || 'none'}`); if (status) status.textContent = `Renderers present on ${selected.map(archLabel).join(' + ')}.`; },
    () => { light('receipt', 'is-pass', 0); setState('receipt', `${delivery.auditCode}`); if (status) status.textContent = `Delivery receipt: ${delivery.auditCode}.`; },
    () => { light('occupant', 'is-pass', 0); setState('occupant', `${ack.auditCode}`); if (status) status.textContent = `Occupant response: ${ack.auditCode}. Delivery and response stay separate.`; },
  ];

  for (const step of steps) {
    await wait(reduce ? 0 : 620);
    if (token !== archToken) { if (button) button.disabled = false; return; }
    step();
    refreshIcons();
  }
  if (button) button.disabled = false;
}

const archRun = $('#arch-run');
if (archRun) archRun.addEventListener('click', runArchitecture);

await applyLocale();
buildTrustList();
buildArchitecture();
renderLifecycle(0);
renderTrust(0);
renderContract('node');
refreshIcons();

if (location.hash) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    let targetId = location.hash.slice(1);
    try { targetId = decodeURIComponent(targetId); } catch { /* keep the literal hash */ }
    const target = document.getElementById(targetId);
    if (!target) return;
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    target.scrollIntoView({ block: 'start' });
    document.documentElement.style.scrollBehavior = previousScrollBehavior;
  }));
}
