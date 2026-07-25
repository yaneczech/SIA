import { actorLabel, buildPhaseTrace, coordinateAcknowledgement, coordinateDelivery, evaluateInteraction, nodeCatalog, resolveNode, trustMatrix, RENDERERS } from './sia-engine.js';

const COLLISION_ID = 'Interaction.Event.Alert.Collision.Warning';
const NOW_PLAYING_ID = 'Interaction.Event.Notification.Media.NowPlaying';

const scenarios = {
  valid: { nodeId: COLLISION_ID, actorClass: 'adas', signatureValid: true, ageMs: 80, replayed: false, vehicleState: 'moving', roadType: 'highway', driverState: 'attentive', renderers: { cluster: true, voice: true, ivi: true } },
  spoof: { nodeId: COLLISION_ID, actorClass: 'third_party_app', signatureValid: true, ageMs: 40, replayed: false, vehicleState: 'moving', roadType: 'highway', driverState: 'attentive', renderers: { cluster: true, voice: true, ivi: true } },
  stale: { nodeId: COLLISION_ID, actorClass: 'adas', signatureValid: true, ageMs: 1100, replayed: false, vehicleState: 'moving', roadType: 'highway', driverState: 'attentive', renderers: { cluster: true, voice: true, ivi: true } },
  replay: { nodeId: COLLISION_ID, actorClass: 'adas', signatureValid: true, ageMs: 60, replayed: true, vehicleState: 'moving', roadType: 'highway', driverState: 'attentive', renderers: { cluster: true, voice: true, ivi: true } },
  fallback: { nodeId: COLLISION_ID, actorClass: 'adas', signatureValid: true, ageMs: 60, replayed: false, vehicleState: 'moving', roadType: 'highway', driverState: 'attentive', renderers: { cluster: true, voice: true, ivi: true }, deliveryMode: 'fallback' },
  distracted: { nodeId: NOW_PLAYING_ID, actorClass: 'service', signatureValid: true, ageMs: 200, replayed: false, vehicleState: 'moving', roadType: 'urban', driverState: 'distracted', renderers: { cluster: true, voice: true, ivi: true } },
};

const emitterCopy = {
  [COLLISION_ID]: { legit: 'Detects a collision risk and emits the meaning “critical warning”.', illegit: (actor) => `${actor} attempts to emit the meaning “critical warning”.` },
  [NOW_PLAYING_ID]: { legit: 'A media session changes track and emits an informational notification.', illegit: (actor) => `${actor} attempts to emit a media notification.` },
};

let activeScenario = 'valid';
let animationToken = 0;
let ackTimer = null;
let pendingDecision = null;
let inspectionContext = null;
let activeInspectionPhase = 'ontology';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const refreshIcons = () => window.lucide?.createIcons({ attrs: { width: 18, height: 18, 'stroke-width': 1.8 } });
const setIcon = (selector, name) => {
  const element = typeof selector === 'string' ? $(selector) : selector;
  element.innerHTML = `<i data-lucide="${name}" aria-hidden="true"></i>`;
  refreshIcons();
};
const highlightJson = (selector, value) => {
  const escaped = JSON.stringify(value, null, 2)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  $(selector).innerHTML = escaped.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:|"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (token) => {
      let className = 'json-number';
      if (token.startsWith('"')) className = token.trimEnd().endsWith(':') ? 'json-key' : 'json-string';
      else if (token === 'true' || token === 'false') className = 'json-boolean';
      else if (token === 'null') className = 'json-null';
      return `<span class="${className}">${token}</span>`;
    },
  );
};

$$('.scenario-chip').forEach((button) => button.addEventListener('click', () => {
  activeScenario = button.dataset.scenario;
  $$('.scenario-chip').forEach((item) => {
    const active = item === button;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  resetAnimation();
}));

const phaseTabs = $$('[data-phase]');
phaseTabs.forEach((button) => {
  button.addEventListener('click', () => selectInspectionPhase(button.dataset.phase));
  button.addEventListener('keydown', (event) => {
    const currentIndex = phaseTabs.indexOf(button);
    let targetIndex = null;
    if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % phaseTabs.length;
    if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + phaseTabs.length) % phaseTabs.length;
    if (event.key === 'Home') targetIndex = 0;
    if (event.key === 'End') targetIndex = phaseTabs.length - 1;
    if (targetIndex === null) return;
    event.preventDefault();
    const target = phaseTabs[targetIndex];
    selectInspectionPhase(target.dataset.phase);
    target.focus();
  });
});

$('#run-button').addEventListener('click', () => runScenario());
$('#replay-button').addEventListener('click', () => runScenario());
$('#ack-button').addEventListener('click', () => completeAck(true));
$('#panel-ack-button').addEventListener('click', () => completeAck(true));
$('#resume-button').addEventListener('click', () => runScenario({
  ...scenarios[activeScenario],
  driverState: 'attentive',
  resumedFromDeferred: true,
}));

function resetAnimation() {
  animationToken += 1;
  clearInterval(ackTimer);
  ackTimer = null;
  pendingDecision = null;
  $$('.stage, .flow-link').forEach((el) => el.classList.remove('is-active', 'is-pass', 'is-fail', 'is-muted'));
  $$('.renderer').forEach((el) => el.classList.remove('is-selected', 'is-rejected', 'is-presented', 'is-delivery-failed', 'is-delivery-pending'));
  $$('.renderer-receipt').forEach((el) => { el.className = 'renderer-receipt'; el.textContent = 'not dispatched'; });
  $('#trust-result').className = 'stage-result';
  $('#translation-result').className = 'stage-result';
  $('#runtime-result').className = 'stage-result';
  $('#trust-result').textContent = 'waiting';
  $('#translation-result').textContent = 'waiting';
  $('#runtime-result').textContent = 'waiting';
  $('#decision-state').className = 'decision-state waiting';
  setIcon('#decision-icon', 'arrow-right');
  $('#decision-title').textContent = 'Ready';
  $('#decision-copy').textContent = 'Run a scenario to see why the interaction passes—or where it safely stops.';
  $('#decision-announcement').textContent = '';
  $('#runtime-time').textContent = '0 ms';
  $('#check-list').innerHTML = '';
  $('#run-button').hidden = false;
  $('#ack-button').hidden = true;
  $('#panel-ack-button').hidden = true;
  $('#resume-button').hidden = true;
  $$('#delivery-flow, #occupant-ack-flow').forEach((el) => { el.className = `ack-flow ${el.id === 'delivery-flow' ? 'delivery-flow' : 'occupant-flow'}`; });
  $('#delivery-flow-label').textContent = 'DELIVERY RECEIPT';
  $('#replay-button').hidden = true;
  const input = scenarios[activeScenario];
  updateScenarioCopy(input);
  inspectionContext = { input, decision: evaluateInteraction(input), delivery: null, acknowledgement: null };
  selectInspectionPhase('ontology');
}

function updateScenarioCopy(input) {
  const node = resolveNode(input.nodeId);
  const copy = emitterCopy[input.nodeId] || emitterCopy[COLLISION_ID];
  const permittedActors = node.trustRequirements.permittedActorClasses;
  $('#emitter-detail').textContent = input.actorClass === permittedActors[0] ? copy.legit : copy.illegit(actorLabel(input.actorClass));
  $('#ontology-detail').textContent = `${node.label} (${node.type}) — permitted: ${permittedActors.map(actorLabel).join(', ')}. Base glance cost: ${node.attention.glanceTimeMs} ms.`;
}

async function runScenario(inputOverride = null) {
  const shouldMoveFocus = ['run-button', 'replay-button', 'resume-button'].includes(document.activeElement?.id);
  resetAnimation();
  const token = ++animationToken;
  const input = inputOverride || scenarios[activeScenario];
  const node = resolveNode(input.nodeId);
  const result = evaluateInteraction(input);
  inspectionContext = { input, decision: result, delivery: null, acknowledgement: null };
  $('#run-button').hidden = true;
  $('#decision-announcement').textContent = 'Scenario evaluation started.';
  if (shouldMoveFocus) $('#decision-title').focus({ preventScroll: true });
  const start = performance.now();

  // Direct-child flow-links of .pipeline, in document order: [ontology→emitter, emitter→boundary, boundary→renderers].
  const pipelineLinks = $$('.pipeline > .flow-link');
  // Flow-links inside the boundary: [trust→translation, translation→runtime].
  const boundaryLinks = $$('.sia-boundary > .flow-link');

  await activate($('[data-stage="ontology"]'), 500, token);
  await activate(pipelineLinks[0], 350, token);
  await activate($('[data-stage="emitter"]'), 550, token);
  await activate(pipelineLinks[1], 350, token);
  await activate($('[data-stage="trust"]'), 800, token);
  if (token !== animationToken) return;
  renderChecks(result.checks);
  $('#trust-result').textContent = result.accepted ? 'verified' : 'rejected';
  $('#trust-result').classList.add(result.accepted ? 'pass' : 'fail');
  $('[data-stage="trust"]').classList.add(result.accepted ? 'is-pass' : 'is-fail');

  if (!result.accepted) {
    finishDecision(result, Math.round(performance.now() - start));
    $$('.translation, .renderers').forEach((el) => el.classList.add('is-muted'));
    return;
  }

  await activate(boundaryLinks[0], 450, token);
  await activate($('[data-stage="translation"]'), 750, token);
  if (token !== animationToken) return;
  const translationDeferred = result.outcome === 'context_deferred';
  const contextTerminated = ['context_dropped', 'not_applicable'].includes(result.outcome);
  const translationPass = !translationDeferred && !contextTerminated && result.outcome !== 'no_safe_renderer';
  $('#translation-result').textContent = translationDeferred ? result.retention.disposition : result.outcome === 'context_dropped' ? 'dropped' : result.outcome === 'not_applicable' ? 'not applicable' : result.primary ? 'selected' : 'stopped';
  $('#translation-result').classList.add(translationDeferred ? 'pending' : translationPass ? 'pass' : 'fail');
  $('[data-stage="translation"]').classList.add(translationDeferred ? 'is-active' : translationPass ? 'is-pass' : 'is-fail');
  $('#translation-detail').textContent = contextTerminated || translationDeferred
    ? result.reason
    : input.renderers.cluster || node.type !== 'Alert'
      ? result.reason
      : 'The cluster is offline. Translation looks for the next safe option in the fallback chain.';

  if (contextTerminated || translationDeferred) {
    finishDecision(result, Math.round(performance.now() - start));
    $$('.runtime, .renderers').forEach((el) => el.classList.add('is-muted'));
    return;
  }

  await activate(boundaryLinks[1], 350, token);
  await activate($('[data-stage="runtime"]'), 450, token);
  $('#runtime-result').textContent = result.primary ? 'awaiting delivery' : 'not opened';
  await activate(pipelineLinks[2], 450, token);
  await activate($('[data-stage="renderers"]'), 500, token);
  if (token !== animationToken) return;
  markRenderers(result);
  const delivery = simulateDelivery(input, result, input.deliveryMode || 'presented');
  inspectionContext.delivery = delivery;
  await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? 0 : 450));
  if (token !== animationToken) return;
  showDelivery(delivery);

  if (!delivery.delivered) {
    const ack = coordinateAcknowledgement(result, {}, delivery);
    inspectionContext.acknowledgement = ack;
    finishDecision(result, Math.round(performance.now() - start), delivery, ack);
    return;
  }

  const responseRequired = node.occupantResponse.kind !== 'none';
  $('#runtime-result').textContent = responseRequired ? 'awaiting occupant' : 'delivered';
  $('#runtime-result').classList.add('pass');
  if (responseRequired) beginAck(result, Math.round(performance.now() - start), delivery);
  else {
    const ack = coordinateAcknowledgement(result, {}, delivery);
    inspectionContext.acknowledgement = ack;
    finishDecision(result, Math.round(performance.now() - start), delivery, ack);
  }
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

async function activate(element, duration, token) {
  if (token !== animationToken) return;
  if (element) {
    element.classList.add('is-active');
    if (element.dataset.stage) selectInspectionPhase(element.dataset.stage);
  }
  // Honour prefers-reduced-motion: keep the same end state, drop the step delays.
  await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? 0 : duration));
}

function renderChecks(checks) {
  $('#check-list').innerHTML = checks.map((item) => `<div class="check ${item.passed ? 'pass' : 'fail'}"><span><i data-lucide="${item.passed ? 'check' : 'x'}" aria-hidden="true"></i></span><b>${item.label}</b><small>${item.passed ? 'passed' : 'failed'}</small></div>`).join('');
  refreshIcons();
}

function markRenderers(result) {
  $$('.renderer').forEach((el) => {
    const name = el.dataset.renderer;
    el.classList.toggle('is-selected', name === result.primary || result.concurrent.includes(name));
    el.classList.toggle('is-rejected', result.rejectedRenderers.includes(name));
  });
}

function showDelivery(delivery) {
  Object.entries(delivery.receipts).forEach(([name, receipt]) => {
    const renderer = $(`.renderer[data-renderer="${name}"]`);
    if (!renderer) return;
    const badge = $('.renderer-receipt', renderer);
    badge.textContent = receipt.state.replace('_', ' ');
    badge.classList.add(`is-${receipt.state}`);
    if (receipt.state !== 'pending') renderer.classList.add('is-selected');
    renderer.classList.toggle('is-presented', receipt.state === 'presented');
    renderer.classList.toggle('is-delivery-failed', ['failed', 'timed_out'].includes(receipt.state));
    renderer.classList.toggle('is-delivery-pending', ['pending', 'received'].includes(receipt.state));
  });
  const flow = $('#delivery-flow');
  flow.classList.add('is-active', delivery.delivered ? 'is-success' : delivery.final ? 'is-failed' : 'is-pending');
  $('#delivery-flow-label').textContent = delivery.state === 'fallback_presented'
    ? 'DELIVERY RECEIPT · BACKUP PRESENTED'
    : delivery.state === 'presented'
      ? 'DELIVERY RECEIPT · PRESENTED'
      : delivery.state === 'received'
        ? 'DELIVERY RECEIPT · RECEIVED'
        : 'DELIVERY RECEIPT · TIMEOUT';
  if (activeInspectionPhase === 'runtime' || activeInspectionPhase === 'renderers') selectInspectionPhase(activeInspectionPhase);
}

function simulateDelivery(input, result, mode) {
  if (!result.primary) return coordinateDelivery(input, result);
  const selected = [result.primary, ...result.concurrent];
  const availableChain = result.node.presentationContract.preferredRenderers.filter((name) => input.renderers?.[name]);
  const receipts = {};

  if (mode === 'presented') {
    selected.forEach((name, index) => { receipts[name] = { state: 'presented', elapsedMs: 72 + index * 18 }; });
  } else if (mode === 'received') {
    selected.forEach((name, index) => { receipts[name] = { state: 'received', elapsedMs: 40 + index * 10 }; });
  } else if (mode === 'fallback') {
    receipts[result.primary] = { state: 'failed', elapsedMs: 118 };
    const alternate = [...result.concurrent, ...availableChain.filter((name) => name !== result.primary && !result.concurrent.includes(name))][0];
    if (alternate) receipts[alternate] = { state: 'presented', elapsedMs: 156 };
  } else if (mode === 'timeout') {
    [...new Set([...selected, ...availableChain])].forEach((name) => { receipts[name] = { state: 'timed_out', elapsedMs: result.node.presentationContract.deliveryTimeoutMs }; });
  }

  return coordinateDelivery(input, result, { receipts });
}

function finishDecision(result, elapsed, delivery = null, acknowledgement = null) {
  const state = $('#decision-state');
  const rejected = result.outcome === 'rejected';
  const deferred = result.outcome === 'context_deferred';
  const contextDropped = result.outcome === 'context_dropped';
  const notApplicable = result.outcome === 'not_applicable';
  const deliveryFailed = Boolean(delivery && result.primary && !delivery.delivered);
  const failed = rejected || result.outcome === 'no_safe_renderer' || contextDropped || notApplicable || deliveryFailed;
  state.className = `decision-state ${deferred ? 'deferred' : failed ? 'blocked' : 'approved'}`;
  setIcon('#decision-icon', deferred ? 'archive-restore' : failed ? 'x' : 'check');
  $('#decision-title').textContent = rejected ? 'Safely stopped' : deferred ? (result.retention.disposition === 'coalesce' ? 'Latest state retained' : 'Notification deferred') : contextDropped ? 'Recorded and dropped' : notApplicable ? 'Not applicable in this context' : deliveryFailed ? (delivery.final ? 'Delivery failed' : 'Delivery not confirmed') : result.outcome === 'fallback' || delivery?.fallbackUsed ? 'Safe fallback used' : failed ? 'Not displayed' : inspectionContext?.input?.resumedFromDeferred ? 'Retained state delivered' : 'Interaction delivered';
  $('#decision-copy').textContent = deliveryFailed
    ? delivery.final
      ? `The declared renderer-success policy was not satisfied. Runtime records ${delivery.auditCode}; occupant response was never started.`
      : 'A renderer accepted the message, but presentation is not confirmed yet. Runtime keeps the delivery receipt open and does not start occupant acknowledgement.'
    : delivery?.delivered
      ? `${delivery.deliveredVia.map(rendererLabel).join(' + ')} confirmed presentation${inspectionContext?.input?.resumedFromDeferred ? ' after Context Policy re-evaluated the retained state' : ''}. ${result.reason}`
      : result.reason;
  $('#runtime-time').textContent = `${elapsed} ms demo`;
  if (deliveryFailed) {
    $('[data-stage="runtime"]').classList.add(delivery.final ? 'is-fail' : 'is-active');
    $('#runtime-result').textContent = delivery.final ? 'delivery failed' : 'receipt pending';
    if (delivery.final) $('#runtime-result').classList.add('fail');
  } else if (acknowledgement?.state === 'not_required') {
    $('[data-stage="runtime"]').classList.add('is-pass');
    $('#runtime-result').textContent = 'delivered';
  }
  $('#resume-button').hidden = !deferred;
  $('#replay-button').hidden = false;
  selectInspectionPhase(delivery ? 'runtime' : activeInspectionPhase);
  announceDecision();
}

function beginAck(result, elapsed, delivery) {
  pendingDecision = { result, delivery, elapsed, startedAt: performance.now() };
  $('#decision-state').className = 'decision-state waiting-ack';
  setIcon('#decision-icon', 'reply');
  $('#decision-title').textContent = 'Awaiting acknowledgement';
  $('#decision-copy').textContent = `${delivery.deliveredVia.map(rendererLabel).join(' + ')} confirmed presentation. Coordination Runtime now waits for the separate driver acknowledgement.`;
  $('#ack-button').hidden = false;
  $('#panel-ack-button').hidden = false;
  $('#replay-button').hidden = true;
  announceDecision();
  const timeoutMs = result.node.occupantResponse.timeoutMs ?? 2000;
  const tick = () => {
    if (!pendingDecision) return;
    const passed = performance.now() - pendingDecision.startedAt;
    const remaining = Math.max(0, timeoutMs - passed);
    $('#ack-countdown').textContent = `${(remaining / 1000).toFixed(1)} s`;
    $('#runtime-time').textContent = `${Math.round(passed)} ms demo`;
    if (remaining === 0) completeAck(false);
  };
  tick();
  ackTimer = setInterval(tick, 50);
}

function completeAck(explicit) {
  if (!pendingDecision) return;
  const shouldMoveFocus = ['ack-button', 'panel-ack-button'].includes(document.activeElement?.id);
  clearInterval(ackTimer);
  const elapsedMs = explicit ? Math.round(performance.now() - pendingDecision.startedAt) : (pendingDecision.result.node.occupantResponse.timeoutMs ?? 2000);
  const ack = coordinateAcknowledgement(pendingDecision.result, { acknowledged: explicit, elapsedMs }, pendingDecision.delivery);
  inspectionContext.acknowledgement = ack;
  $('#ack-button').hidden = true;
  $('#panel-ack-button').hidden = true;
  $('#occupant-ack-flow').classList.add('is-active', ack.state === 'acknowledged' ? 'is-success' : 'is-pending');
  $('[data-stage="runtime"]').classList.add('is-pass');
  $('#runtime-result').textContent = ack.state === 'acknowledged' ? 'acknowledged' : 'timeout';
  $('#runtime-result').classList.add('pass');
  $('#decision-state').className = 'decision-state approved';
  setIcon('#decision-icon', 'check');
  $('#decision-title').textContent = ack.state === 'acknowledged' ? 'Interaction acknowledged' : 'Interaction closed by timeout';
  $('#decision-copy').textContent = ack.state === 'acknowledged'
    ? `The driver acknowledged the interaction in ${elapsedMs} ms. SIA synchronizes the state across outputs and writes the audit record.`
    : 'The driver did not respond within the declared timeout. Runtime closed the wait using the defined timeout and wrote the audit record.';
  $('#runtime-time').textContent = `${elapsedMs} ms demo`;
  $('#replay-button').hidden = false;
  selectInspectionPhase('runtime');
  announceDecision();
  if (shouldMoveFocus) $('#decision-title').focus({ preventScroll: true });
  pendingDecision = null;
}

function announceDecision() {
  $('#decision-announcement').textContent = `${$('#decision-title').textContent}. ${$('#decision-copy').textContent}`;
}

function selectInspectionPhase(phase) {
  activeInspectionPhase = phase;
  phaseTabs.forEach((button) => {
    const selected = button.dataset.phase === phase;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected) $('#phase-panel').setAttribute('aria-labelledby', button.id);
  });
  if (!inspectionContext) return;
  const detail = buildPhaseTrace(inspectionContext.input, inspectionContext.decision, inspectionContext.acknowledgement, inspectionContext.delivery)[phase];
  if (!detail) return;
  setIcon('#inspector-icon', detail.icon);
  $('#inspector-question').textContent = detail.question;
  $('#inspector-answer').textContent = detail.answer;
  $('#inspector-explanation').textContent = detail.explanation;
  $('#inspector-input-title').textContent = detail.input.title;
  $('#inspector-rule-title').textContent = detail.rule.title;
  $('#inspector-output-title').textContent = detail.output.title;
  setList('#inspector-input', detail.input.items);
  setList('#inspector-rules', detail.rule.items);
  setList('#inspector-output', detail.output.items);
  $('#trace-rationale').textContent = detail.rationale;
  highlightJson('#phase-trace', detail.trace);
}

function setList(selector, items) {
  const list = $(selector);
  list.replaceChildren(...items.map((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    return li;
  }));
}

// --- Trust matrix -----------------------------------------------------

function renderTrustMatrix() {
  const matrix = trustMatrix();
  const nodes = nodeCatalog();
  const table = $('#trust-matrix');
  const head = `<thead><tr><th scope="col">Actor class</th>${nodes.map((n) => `<th scope="col">${n.label}<small>${n.type}</small></th>`).join('')}</tr></thead>`;
  const body = `<tbody>${matrix.map((row) => `<tr><th scope="row">${row.label}</th>${row.cells.map((cell) => `<td class="${cell.allowed ? 'allowed' : 'blocked'}"><i data-lucide="${cell.allowed ? 'check' : 'x'}" aria-hidden="true"></i><span class="sr-only">${cell.allowed ? 'Allowed' : 'Blocked'}</span></td>`).join('')}</tr>`).join('')}</tbody>`;
  table.innerHTML = head + body;
  refreshIcons();
}

// --- Test lab -----------------------------------------------------------

function populateNodeSelect() {
  const select = $('#node');
  select.innerHTML = nodeCatalog().map((node) => `<option value="${node.id}">${node.label} (${node.type} · ${node.priority})</option>`).join('');
  select.value = COLLISION_ID;
}

const labInputs = ['node', 'actor', 'signature', 'credential-active', 'declaration-bound', 'validity-bounded', 'age', 'replay', 'vehicle-state', 'road-type', 'driver-state', 'cluster-online', 'voice-online', 'ivi-online', 'delivery-mode', 'ack-mode', 'inject-priority'];
labInputs.forEach((id) => $(`#${id}`).addEventListener('input', () => {
  updateLab();
  writeLabStateToUrl();
}));

// --- Shareable lab state -------------------------------------------------
// The URL carries only the controls that differ from the published baseline,
// so a shared scenario link stays short and reviewable by eye. The baseline is
// captured during init, after the node select has been populated.
let labBaseline = {};

function captureLabBaseline() {
  labBaseline = readLabControls();
}

function readLabControls() {
  return Object.fromEntries(labInputs.map((id) => {
    const el = $(`#${id}`);
    return [id, el.type === 'checkbox' ? el.checked : el.value];
  }));
}

function writeLabStateToUrl() {
  const current = readLabControls();
  const params = new URLSearchParams();
  for (const id of labInputs) {
    if (String(current[id]) === String(labBaseline[id])) continue;
    params.set(id, typeof current[id] === 'boolean' ? (current[id] ? '1' : '0') : current[id]);
  }
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
}

function applyLabStateFromUrl() {
  const params = new URLSearchParams(location.search);
  let applied = 0;
  for (const id of labInputs) {
    if (!params.has(id)) continue;
    const el = $(`#${id}`);
    const raw = params.get(id);
    if (el.type === 'checkbox') el.checked = raw === '1' || raw === 'true';
    else if (el.tagName === 'SELECT') {
      if (![...el.options].some((option) => option.value === raw)) continue;
      el.value = raw;
    } else el.value = raw;
    applied += 1;
  }
  return applied;
}

function resetLab() {
  for (const [id, value] of Object.entries(labBaseline)) {
    const el = $(`#${id}`);
    if (el.type === 'checkbox') el.checked = value;
    else el.value = value;
  }
  updateLab();
  writeLabStateToUrl();
  $('#node').focus();
}

$('#lab-reset')?.addEventListener('click', resetLab);
$('#lab-share')?.addEventListener('click', (event) => {
  writeLabStateToUrl();
  copyToClipboard(location.href, event.currentTarget, 'Link copied');
});
$('#audit-copy')?.addEventListener('click', (event) => {
  copyToClipboard($('#audit-log').textContent, event.currentTarget, 'Record copied');
});

async function copyToClipboard(text, button, doneLabel) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'fixed';
    scratch.style.opacity = '0';
    document.body.append(scratch);
    scratch.select();
    document.execCommand('copy');
    scratch.remove();
  }
  if (!button) return;
  const previous = button.innerHTML;
  button.innerHTML = `<i data-lucide="check" aria-hidden="true"></i> ${doneLabel}`;
  refreshIcons();
  window.setTimeout(() => {
    button.innerHTML = previous;
    refreshIcons();
  }, 1500);
}

function updateLab() {
  const nodeId = $('#node').value;
  const node = resolveNode(nodeId);
  $('#age-limit-label').textContent = `${node.trustRequirements.maxIngressAgeMs} ms ingress limit`;
  const ageMs = Number($('#age').value);
  $('#age-output').value = `${ageMs} ms`;
  const injectPriority = $('#inject-priority').checked;
  const input = {
    nodeId,
    actorClass: $('#actor').value,
    signatureValid: $('#signature').checked,
    revoked: !$('#credential-active').checked,
    nodeSchemaDigest: $('#declaration-bound').checked ? node.schemaDigest : 'f'.repeat(64),
    validUntilMs: $('#validity-bounded').checked ? undefined : 1784116800100 + node.semanticValidityMs,
    ageMs,
    replayed: $('#replay').checked,
    vehicleState: $('#vehicle-state').value,
    roadType: $('#road-type').value,
    driverState: $('#driver-state').value,
    renderers: { cluster: $('#cluster-online').checked, voice: $('#voice-online').checked, ivi: $('#ivi-online').checked },
    injectedPriority: injectPriority ? 'critical' : null,
  };
  const result = evaluateInteraction(input);
  const delivery = simulateDelivery(input, result, $('#delivery-mode').value);
  const responseRequired = node.occupantResponse.kind !== 'none';
  $('#ack-mode').disabled = !delivery.delivered || !responseRequired;
  const ackMode = $('#ack-mode').value;
  const ack = coordinateAcknowledgement(result, {
    acknowledged: ackMode === 'explicit',
    elapsedMs: ackMode === 'timeout' ? (node.occupantResponse.timeoutMs ?? 2000) : ackMode === 'pending' ? 640 : 420,
  }, delivery);
  const contextDeferred = result.outcome === 'context_deferred';
  const decisionBlocked = ['rejected', 'no_safe_renderer', 'context_dropped', 'not_applicable'].includes(result.outcome);
  const blocked = decisionBlocked || delivery.state === 'failed';
  const pending = !blocked && !delivery.delivered;
  $('#lab-output').classList.toggle('is-blocked', blocked);
  $('#lab-output').classList.toggle('is-pending', pending);
  setIcon('#lab-status-icon', blocked ? 'x' : contextDeferred ? 'archive-restore' : pending ? 'clock-3' : 'check');
  $('#lab-status-title').textContent = result.outcome === 'rejected' ? 'Message rejected'
    : contextDeferred ? (result.retention.disposition === 'coalesce' ? 'Latest state held until safe' : 'Deferred until safe')
    : result.outcome === 'context_dropped' ? 'Recorded and dropped'
    : result.outcome === 'not_applicable' ? 'Not applicable in this context'
    : result.outcome === 'no_safe_renderer' ? 'Not displayed'
    : delivery.state === 'failed' ? 'Delivery failed'
    : delivery.state === 'received' || delivery.state === 'pending' ? 'Awaiting presentation receipt'
    : delivery.fallbackUsed ? 'Backup confirmed presentation'
    : ack.state === 'acknowledged' ? 'Delivered and acknowledged'
    : ack.state === 'timed_out' ? 'Delivered · no occupant response'
    : ack.state === 'pending' ? 'Delivered · awaiting occupant'
    : 'Delivery confirmed';
  const deliveryCopy = delivery.state === 'failed'
    ? ' No renderer confirmed presentation; occupant acknowledgement was never started.'
    : delivery.state === 'received' || delivery.state === 'pending'
      ? ' Transport acceptance exists, but presentation is not confirmed; occupant acknowledgement has not started.'
      : delivery.fallbackUsed
        ? ` ${delivery.deliveredVia.map(rendererLabel).join(' + ')} confirmed presentation after the primary renderer failed.`
        : delivery.delivered
          ? ` ${delivery.deliveredVia.map(rendererLabel).join(' + ')} confirmed presentation.`
          : '';
  const acknowledgementCopy = ack.state === 'timed_out'
    ? ' The occupant did not respond before the separate acknowledgement timeout.'
    : ack.state === 'acknowledged'
      ? ' The occupant then acknowledged the interaction.'
      : '';
  $('#lab-status-copy').textContent = result.reason + deliveryCopy + acknowledgementCopy + (result.priority.reservedFieldRejected ? ` The reserved runtime priority field “${result.priority.injected}” caused closed-envelope rejection; declared priority remains “${result.priority.declared}”.` : '');
  $('#mini-trust').textContent = result.accepted ? 'verified' : 'rejected';
  $('#mini-context').textContent = contextDeferred ? result.retention.disposition : result.outcome === 'context_dropped' ? 'dropped' : result.outcome === 'not_applicable' ? 'not applicable' : contextSummary(result);
  $('#mini-output').textContent = result.primary ? [result.primary, ...result.concurrent].map(rendererLabel).join(' + ') : contextDeferred ? 'held semantic state' : 'none';
  $('#mini-delivery').textContent = contextDeferred ? 'not dispatched yet' : ({ presented: 'presented', fallback_presented: 'backup presented', received: 'received only', pending: 'waiting', failed: 'failed / timeout', not_dispatched: 'not dispatched' })[delivery.state];
  $('#mini-ack').textContent = ({ acknowledged: 'acknowledged', timed_out: 'response timeout', pending: 'waiting', not_required: 'not required', not_started: 'not started' })[ack.state];
  $('[data-mini="trust"]').classList.toggle('is-failed', !result.accepted);
  $('[data-mini="context"]').classList.toggle('is-failed', ['context_dropped', 'not_applicable'].includes(result.outcome));
  $('[data-mini="context"]').classList.toggle('is-pending', contextDeferred);
  $('[data-mini="output"]').classList.toggle('is-failed', !result.primary && !contextDeferred);
  $('[data-mini="output"]').classList.toggle('is-pending', contextDeferred);
  $('[data-mini="delivery"]').classList.toggle('is-failed', delivery.state === 'failed');
  $('[data-mini="delivery"]').classList.toggle('is-pending', contextDeferred || ['received', 'pending'].includes(delivery.state));
  $('[data-mini="ack"]').classList.toggle('is-failed', ack.state === 'not_started' && delivery.final);
  $('[data-mini="ack"]').classList.toggle('is-pending', ack.state === 'pending');

  renderTimingReadout(node, ageMs);
  renderAttentionReadout(node, result);

  highlightJson('#audit-log', {
    timestamp: new Date().toISOString(), node_id: nodeId, decision: result.auditCode,
    actor_class: input.actorClass, message_age_ms: ageMs, context_mode: result.contextMode,
    priority: result.priority,
    attention: result.attention,
    retention: result.retention || null,
    primary_renderer: result.primary, concurrent_renderers: result.concurrent,
    delivery: { success_policy: node.presentationContract.deliverySuccessPolicy, state: delivery.state, delivered: delivery.delivered, delivered_via: delivery.deliveredVia, fallback_used: delivery.fallbackUsed, receipts: delivery.receipts, audit_code: delivery.auditCode },
    occupant_response: { kind: node.occupantResponse.kind, authority: node.occupantResponse.authority || null, state: ack.state, elapsed_ms: ack.elapsedMs ?? null, audit_code: ack.auditCode },
    checks: Object.fromEntries(result.checks.map(({ id, passed }) => [id, passed ? 'pass' : 'fail'])),
  });
}

function renderAttentionReadout(node, result) {
  const formula = $('#attention-formula');
  const budgets = $('#attention-budgets');
  if (!result.attention) {
    formula.textContent = result.accepted
      ? result.outcome === 'context_deferred'
        ? `Not evaluated yet — Context Policy ${result.retention.disposition}s the semantic state before renderer budgeting and will re-evaluate it on a context change.`
        : result.outcome === 'not_applicable'
          ? 'Not evaluated — the declaration is not applicable in this context, so renderer delivery never starts.'
          : 'Not evaluated — Context Policy dropped the applicable interaction before a renderer budget was computed.'
      : 'Not evaluated — the node was rejected before reaching Translation.';
    budgets.innerHTML = '';
    return;
  }
  const a = result.attention;
  formula.textContent = `${a.base} ms base × ${a.modifier} (${a.roadType} · ${a.driverState}) = ${a.effective} ms effective glance cost`;
  budgets.innerHTML = Object.entries(RENDERERS).map(([name, cap]) => {
    const b = a.budgets[name];
    const budgetText = cap.maxGlanceBudgetMs == null ? 'eyes-free' : `${cap.maxGlanceBudgetMs} ms budget`;
    let cls = 'unused';
    let text = budgetText;
    if (b) {
      if (b.eligible) { cls = 'ok'; text = b.reason || budgetText; }
      else { cls = b.reason ? 'excluded' : 'over'; text = b.reason || budgetText; }
    }
    return `<div class="attention-budget ${cls}"><b>${cap.label}</b><small>${text}</small></div>`;
  }).join('');
}

function renderTimingReadout(node, ageMs) {
  $('#timing-ingress').textContent = `${ageMs} / ${node.trustRequirements.maxIngressAgeMs} ms`;
  $('#timing-validity').textContent = `${node.semanticValidityMs} ms`;
  $('#timing-delivery').textContent = `${node.presentationContract.deliveryTimeoutMs} ms`;
}

function rendererLabel(name) { return RENDERERS[name]?.label || name; }

function contextSummary(result) {
  if (result.contextMode === 'moving_strict') return 'unknown → strict mode';
  if (!result.context) return result.contextMode;
  const { motionState, operatingMode, energyState } = result.context;
  return [motionState, operatingMode, energyState === 'charging' ? 'charging' : null].filter(Boolean).join(' · ');
}

populateNodeSelect();
renderTrustMatrix();
resetAnimation();
captureLabBaseline();
applyLabStateFromUrl();
updateLab();
refreshIcons();
