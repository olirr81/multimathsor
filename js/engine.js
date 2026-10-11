export function pickNext(topic, stats) {
  const units = topic.units();
  const weights = units.map(u => {
    const k = topic.key(u);
    const s = stats[k] || { attempts: 0, correct: 0, errors: 0, totalFirstTouchMs: 0 };
    const avgLat = s.attempts > 0 ? (s.totalFirstTouchMs / s.attempts) / 1000 : 0;
    let w = 10;
    w += s.errors * 20;
    if (avgLat > 2.5) w += (avgLat - 2.5) * 8;
    if (s.attempts === 0) w += 15;
    return w;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let acc = 0;
  for (let i = 0; i < units.length; i++) {
    acc += weights[i];
    if (r <= acc) return units[i];
  }
  return units[units.length - 1];
}

export function recordAnswer(stats, topic, op, isCorrect, latencyMs) {
  const k = topic.key(op);
  if (!stats[k]) stats[k] = { attempts: 0, correct: 0, errors: 0, totalFirstTouchMs: 0, lastTouchMs: 0 };
  stats[k].attempts++;
  stats[k].totalFirstTouchMs += latencyMs;
  stats[k].lastTouchMs = latencyMs;
  if (isCorrect) stats[k].correct++;
  else stats[k].errors++;
}