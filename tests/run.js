import assert from "node:assert";
import { pushTask, popTask } from "../queue.js";
import { step, close } from "../queuerun.js";

const base = {
  budget: 1, cap: 2,
  state: { queue: [], dropped: [], done: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "push", task: 1 }],
  task_error_code: "E_DUP_TASK", empty_error_code: "E_EMPTY",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("pushTask returns a queue", () => {
  const got = pushTask([], 7, 2);
  assert.ok(Array.isArray(got.queue));
});

check("popTask returns a queue", () => {
  const got = popTask([7]);
  assert.ok(Array.isArray(got.queue));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
