// queue.js：队列操作（基线：一律原样返回）
export function pushTask(queue, task, cap) {
  return { queue: queue, dropped: -1 };
}

export function popTask(queue) {
  return { queue: queue, taken: -1 };
}
