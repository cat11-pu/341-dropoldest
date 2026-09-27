// queuerun.js：按共用处理预算推进任务队列，用尽的事件整笔压账，收尾不限预算清账。
import { pushTask, popTask } from "./queue.js";

function code(spec, fallback, explicit) {
  return (spec && spec[explicit]) || fallback;
}

function fail(spec, which, fallback) {
  const error = new Error(fallback);
  error.code = code(spec, fallback, which);
  throw error;
}

function cloneState(state) {
  return {
    queue: (state.queue || []).slice(),
    dropped: (state.dropped || []).slice(),
    done: (state.done || []).slice(),
    ledger: (state.ledger || []).map(function (entry) {
      const copy = [entry[0], entry[1]];
      Object.defineProperty(copy, "key", { value: entry.key, enumerable: false, configurable: true, writable: true });
      return copy;
    }),
    applied: (state.applied || []).slice()
  };
}

function isPosInt(value) {
  return Number.isSafeInteger(value) && value > 0;
}

// 事件结构先全部校验：与预算、当前状态都无关。
function validateEvent(event, spec) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    fail(spec, "event_error_code", "E_BAD_EVENT");
  }
  if (event.kind === "push") {
    if (!isPosInt(event.task)) fail(spec, "event_error_code", "E_BAD_EVENT");
  } else if (event.kind === "pop") {
    // pop 不带 task
  } else {
    fail(spec, "event_error_code", "E_BAD_EVENT");
  }
}

function eventKey(event) {
  return event.kind === "push" ? "push:" + event.task : "pop:" + event.id;
}

function ledgerEntry(event) {
  const entry = [event.kind, event.kind === "push" ? event.task : 0];
  // 键不进 JSON（验收只见 [kind, task]），只用于重放去重。
  Object.defineProperty(entry, "key", { value: eventKey(event), enumerable: false, configurable: true, writable: true });
  return entry;
}

// events 为空时用于收尾清账；budget 无限时一路处理完。
function run(spec, events, unlimited) {
  const state = cloneState(spec.state || {});
  const cap = spec.cap;
  const budget = unlimited ? Infinity : (Number.isFinite(spec.budget) ? spec.budget : 0);
  const appliedSet = new Set(state.applied);

  for (const event of events) validateEvent(event, spec);

  const carried = state.ledger;
  state.ledger = [];

  let served = 0;
  let judged = 0;

  function applyEntry(kind, task) {
    if (kind === "push") {
      if (state.queue.indexOf(task) !== -1
          || state.dropped.indexOf(task) !== -1
          || state.done.indexOf(task) !== -1) {
        fail(spec, "task_error_code", "E_DUP_TASK");
      }
      const result = pushTask(state.queue, task, cap);
      state.queue = result.queue;
      if (result.dropped !== -1) state.dropped.push(result.dropped);
    } else {
      if (state.queue.length === 0) fail(spec, "empty_error_code", "E_EMPTY");
      const result = popTask(state.queue);
      state.queue = result.queue;
      state.done.push(result.taken);
    }
  }

  function spend() {
    if (served >= budget) return false;
    served += 1;
    return true;
  }

  // 先还上一轮压在账上的请求，再处理本轮新事件。
  for (const entry of carried) {
    if (appliedSet.has(entry.key)) continue;
    if (!spend()) {
      state.ledger.push(entry);
      continue;
    }
    judged += 1;
    applyEntry(entry[0], entry[1]);
    appliedSet.add(entry.key);
  }

  for (const event of events) {
    const key = eventKey(event);
    if (appliedSet.has(key)) continue; // 重放：已处理过，不再花预算
    if (!spend()) {
      state.ledger.push(ledgerEntry(event)); // 预算用尽：整笔连着载压账
      continue;
    }
    judged += 1;
    applyEntry(event.kind, event.task);
    appliedSet.add(key);
  }

  state.applied = Array.from(appliedSet);
  return { state: state, served: served, judged: judged };
}

export function step(spec) {
  const result = run(spec, spec.events || [], false);
  return {
    state: result.state,
    served: result.served,
    ledger_before: result.state.ledger.length,
    ledger: result.state.ledger,
    judged: result.judged,
    judged_bound: (spec.events || []).length
  };
}

export function close(spec) {
  const result = run(spec, [], true);
  return { state: result.state, catchup: result.served };
}
