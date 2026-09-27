// queue.js：队列操作（先进先出，满队挤掉最前的）
export function pushTask(queue, task, cap) {
  const next = queue.slice();
  let dropped = -1;
  if (next.length >= cap) {
    dropped = next.shift();
  }
  next.push(task);
  return { queue: next, dropped: dropped };
}

export function popTask(queue) {
  const next = queue.slice();
  if (next.length === 0) {
    return { queue: next, taken: -1 };
  }
  const taken = next.shift();
  return { queue: next, taken: taken };
}
