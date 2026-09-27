// queuerun.js：按处理预算处理事件，处理不完的连着载压账，收尾不限预算清账
import { pushTask, popTask } from "./queue.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function codes(spec) {
  return {
    badEvent: spec.event_error_code || "E_BAD_EVENT",
    dupTask: spec.task_error_code || "E_DUP_TASK",
    empty: spec.empty_error_code || "E_EMPTY"
  };
}

function normalizeEvent(raw, badEventCode) {
  if (!raw || typeof raw !== "object" || !Number.isInteger(raw.id)) {
    fail(badEventCode, "事件结构不合法");
  }
  if (raw.kind === "push") {
    if (!Number.isInteger(raw.task) || raw.task <= 0) {
      fail(badEventCode, "push 事件的任务号必须是正整数");
    }
    return { id: raw.id, kind: "push", task: raw.task };
  }
  if (raw.kind === "pop") {
    return { id: raw.id, kind: "pop", task: 0 };
  }
  fail(badEventCode, "未知事件类型");
}

function copyState(state) {
  const source = state || {};
  return {
    queue: (source.queue || []).slice(),
    dropped: (source.dropped || []).slice(),
    done: (source.done || []).slice(),
    ledger: (source.ledger || []).slice(),
    applied: (source.applied || []).slice()
  };
}

function applyEvent(state, event, cap, err) {
  if (event.kind === "push") {
    if (state.queue.indexOf(event.task) !== -1
        || state.done.indexOf(event.task) !== -1
        || state.dropped.indexOf(event.task) !== -1) {
      fail(err.dupTask, "任务号重复：" + event.task);
    }
    const pushed = pushTask(state.queue, event.task, cap);
    state.queue = pushed.queue;
    if (pushed.dropped !== -1) {
      state.dropped.push(pushed.dropped);
    }
  } else {
    const popped = popTask(state.queue);
    if (popped.taken === -1) {
      fail(err.empty, "队列空还取");
    }
    state.queue = popped.queue;
    state.done.push(popped.taken);
  }
  state.applied.push(event.id);
}

export function step(spec) {
  const err = codes(spec);
  // 结构校验先做完，与预算无关
  const events = (spec.events || []).map(function (raw) {
    return normalizeEvent(raw, err.badEvent);
  });
  const state = copyState(spec.state);
  const pending = state.ledger.map(function (raw) {
    return normalizeEvent(raw, err.badEvent);
  });
  const cap = spec.cap;
  let budget = Number.isFinite(spec.budget) ? spec.budget : 0;
  let served = 0;
  let judged = 0;
  const judgedBound = pending.length + events.length;
  const rest = [];

  function handle(event) {
    judged += 1;
    if (state.applied.indexOf(event.id) !== -1) {
      return; // 重放不再处理
    }
    if (budget > 0) {
      budget -= 1;
      applyEvent(state, event, cap, err);
      served += 1;
    } else {
      rest.push(event); // 预算用尽，连着载压账
    }
  }

  pending.forEach(handle); // 先还旧账
  events.forEach(handle); // 再办新事件
  state.ledger = rest;

  return {
    state: state,
    served: served,
    ledger_before: rest.length,
    ledger: rest.map(function (event) { return [event.kind, event.task]; }),
    judged: judged,
    judged_bound: judgedBound
  };
}

export function close(spec) {
  const err = codes(spec);
  const state = copyState(spec.state);
  const pending = state.ledger.map(function (raw) {
    return normalizeEvent(raw, err.badEvent);
  });
  let catchup = 0;
  pending.forEach(function (event) {
    if (state.applied.indexOf(event.id) !== -1) {
      return;
    }
    applyEvent(state, event, spec.cap, err);
    catchup += 1;
  });
  state.ledger = [];
  return { state: state, catchup: catchup };
}
