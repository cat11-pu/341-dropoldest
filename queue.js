// queue.js：FIFO 任务队列。满队（到容量）入队先挤掉队首，空队取出给 -1。
export function pushTask(queue, task, cap) {
  const next = queue.slice();
  let dropped = -1;
  if (next.length >= cap && next.length > 0) {
    dropped = next.shift();
  }
  next.push(task);
  return { queue: next, dropped: dropped };
}

export function popTask(queue) {
  const next = queue.slice();
  const taken = next.length > 0 ? next.shift() : -1;
  return { queue: next, taken: taken };
}
