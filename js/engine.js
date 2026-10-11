// Motor adaptativo multi-tema.
// Recibe el "plan" del niño y un pool de temas disponibles, y decide
// qué operación mostrar a continuación, ponderando por errores y latencia.

export function pickNext(plan, topicsMap, forcedTopicId = null) {
  const pool = [];

  if (forcedTopicId) {
    // Modo "Repasar": solo el tema elegido, con sus niveles por defecto
    const t = topicsMap[forcedTopicId];
    if (!t) return null;
    const units = t.units(null); // todos los niveles
    for (const u of units) pool.push({ topicId: forcedTopicId, op: u, weight: 10 });
  } else {
    // Modo normal: mezcla los temas activos del plan del niño
    const order = plan?.order || [];
    for (const topicId of order) {
      const cfg = plan?.topics?.[topicId];
      if (!cfg || !cfg.enabled) continue;
      const t = topicsMap[topicId];
      if (!t) continue;
      const units = t.units(cfg.activeLevels);
      for (const u of units) {
        pool.push({ topicId, op: u, weight: 10 });
      }
    }
  }

  if (pool.length === 0) return null;

  // Aplica el peso adaptativo por errores y latencia
  for (const item of pool) {
    const t = topicsMap[item.topicId];
    const k = t.key(item.op);
    const statsKey = `${item.topicId}:${k}`;
    const s = item._stats?.[statsKey] || null;
    // Ojo: stats se pasa aparte, ver pickNextWithStats
  }

  return pool;
}

// Versión principal usada por la app
export function pickNextWithStats(plan, topicsMap, stats, forcedTopicId = null) {
  const pool = [];

  if (forcedTopicId) {
    const t = topicsMap[forcedTopicId];
    if (!t) return null;
    const units = t.units(null);
    for (const u of units) pool.push({ topicId: forcedTopicId, op: u });
  } else {
    const order = plan?.order || [];
    for (const topicId of order) {
      const cfg = plan?.topics?.[topicId];
      if (!cfg || !cfg.enabled) continue;
      const t = topicsMap[topicId];
      if (!t) continue;
      const units = t.units(cfg.activeLevels);
      for (const u of units) pool.push({ topicId, op: u });
    }
  }

  if (pool.length === 0) return null;

  // Peso por unidad
  const weights = pool.map(item => {
    const t = topicsMap[item.topicId];
    const k = `${item.topicId}:${t.key(item.op)}`;
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
  for (let i = 0; i < pool.length; i++) {
    acc += weights[i];
    if (r <= acc) return pool[i];
  }
  return pool[pool.length - 1];
}

// Guarda el resultado en stats (clave con prefijo de tema)
export function recordAnswer(stats, topicId, topic, op, isCorrect, latencyMs) {
  const k = `${topicId}:${topic.key(op)}`;
  if (!stats[k]) stats[k] = { attempts: 0, correct: 0, errors: 0, totalFirstTouchMs: 0, lastTouchMs: 0 };
  stats[k].attempts++;
  stats[k].totalFirstTouchMs += latencyMs;
  stats[k].lastTouchMs = latencyMs;
  if (isCorrect) stats[k].correct++;
  else stats[k].errors++;
}
