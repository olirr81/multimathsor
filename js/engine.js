function randPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Construye el pool de operaciones candidatas a partir del plan del niño
function buildPool(plan, topicsMap, forcedTopicId) {
  const pool = [];

  if (forcedTopicId) {
    const t = topicsMap[forcedTopicId];
    if (!t) return [];
    // Todos los niveles del tema
    for (const lvl of t.levels()) {
      pool.push({ topicId: forcedTopicId, levelId: lvl.id, inputMode: lvl.inputMode });
    }
    return pool;
  }

  const order = plan?.order || [];
  for (const topicId of order) {
    const cfg = plan?.topics?.[topicId];
    if (!cfg || !cfg.enabled) continue;
    const t = topicsMap[topicId];
    if (!t) continue;
    const active = cfg.activeLevels || t.levels().map(l => l.id);
    for (const lvl of t.levels()) {
      if (!active.includes(lvl.id)) continue;
      pool.push({ topicId, levelId: lvl.id, inputMode: lvl.inputMode });
    }
  }
  return pool;
}

// Elige la siguiente operación, ponderando por errores y latencia
export function pickNextWithStats(plan, topicsMap, stats, forcedTopicId = null) {
  const pool = buildPool(plan, topicsMap, forcedTopicId);
  if (!pool.length) return null;

  // Para cada nivel del pool, generamos UN enunciado candidato para
  // poder ponderar por clave de stats. El motor regenerará al final.
  const candidates = pool.map(slot => {
    const t = topicsMap[slot.topicId];
    const item = t.generate(slot.levelId);
    return { ...slot, item, topic: t };
  });

  // Ponderación
  const weights = candidates.map(c => {
    const k = `${c.topicId}:${c.levelId}:${c.topic.key(c.item)}`;
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
  for (let i = 0; i < candidates.length; i++) {
    acc += weights[i];
    if (r <= acc) {
      // Regeneramos uno nuevo del mismo nivel para no repetir siempre el mismo enunciado
      const chosen = candidates[i];
      const fresh = chosen.topic.generate(chosen.levelId);
      return {
        topicId: chosen.topicId,
        levelId: chosen.levelId,
        inputMode: chosen.inputMode,
        item: fresh,
        topic: chosen.topic
      };
    }
  }
  const last = candidates[candidates.length - 1];
  return {
    topicId: last.topicId,
    levelId: last.levelId,
    inputMode: last.inputMode,
    item: last.topic.generate(last.levelId),
    topic: last.topic
  };
}

// Guarda el resultado en stats con la nueva clave topic:level:op
export function recordAnswer(stats, topicId, levelId, topic, item, isCorrect, latencyMs) {
  const k = `${topicId}:${levelId}:${topic.key(item)}`;
  if (!stats[k]) stats[k] = { attempts: 0, correct: 0, errors: 0, totalFirstTouchMs: 0, lastTouchMs: 0 };
  stats[k].attempts++;
  stats[k].totalFirstTouchMs += latencyMs;
  stats[k].lastTouchMs = latencyMs;
  if (isCorrect) stats[k].correct++;
  else stats[k].errors++;
}
