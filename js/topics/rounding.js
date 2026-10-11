function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Elige un número "interesante" para redondear (evita múltiplos exactos)
function randRoundable(min, max, step) {
  let n;
  do {
    n = randInt(min, max);
  } while (n % step === 0);
  return n;
}

export default {
  id: 'rounding',
  nombre: 'Rounding',
  nombreLargo: 'Round numbers',
  icon: '≈',
  color: 'sky',

  levels() {
    return [
      { id: 'nearest10',   label: 'Nearest 10',   group: 'Rounding', inputMode: 'numeric' },
      { id: 'nearest100',  label: 'Nearest 100',  group: 'Rounding', inputMode: 'numeric' },
      { id: 'nearest1000', label: 'Nearest 1000', group: 'Rounding', inputMode: 'numeric' }
    ];
  },

  generate(levelId) {
    if (levelId === 'nearest10') {
      const n = randRoundable(11, 999, 10);
      const answer = Math.round(n / 10) * 10;
      return {
        prompt: `Round ${n} to the nearest 10`,
        answer,
        meta: { n, step: 10 }
      };
    }
    if (levelId === 'nearest100') {
      const n = randRoundable(101, 9999, 100);
      const answer = Math.round(n / 100) * 100;
      return {
        prompt: `Round ${n} to the nearest 100`,
        answer,
        meta: { n, step: 100 }
      };
    }
    if (levelId === 'nearest1000') {
      const n = randRoundable(1001, 99999, 1000);
      const answer = Math.round(n / 1000) * 1000;
      return {
        prompt: `Round ${n} to the nearest 1000`,
        answer,
        meta: { n, step: 1000 }
      };
    }
    return { prompt: '?', answer: 0 };
  },

  // Distractores inteligentes basados en errores típicos
  distractors(item) {
    const { n, step } = item.meta;
    const correct = item.answer;
    const s = new Set([correct]);

    // Error 1: redondear hacia abajo cuando tocaba subir
    s.add(Math.floor(n / step) * step);
    // Error 2: redondear hacia arriba cuando tocaba bajar
    s.add(Math.ceil(n / step) * step);
    // Error 3: paso equivocado (10x menos o 10x más)
    s.add(Math.round(n / (step / 10)) * (step / 10));
    s.add(Math.round(n / (step * 10)) * (step * 10));

    // Relleno si no hay suficientes
    while (s.size < 4) {
      const delta = (Math.floor(Math.random() * 5) + 1) * step * (Math.random() < 0.5 ? 1 : -1);
      s.add(Math.max(0, correct + delta));
    }

    return [...s].slice(0, 4).sort(() => Math.random() - 0.5);
  },

  key(item) {
    return String(item.meta?.n ?? item.prompt);
  },

  render(item) {
    // Divide el prompt en dos líneas para que se lea mejor
    const match = item.prompt.match(/^Round (\d+) to the nearest (\d+)$/);
    if (match) {
      return `<div class="text-4xl sm:text-5xl font-black text-white">${match[1]}</div>
              <div class="text-xs sm:text-sm text-sky-300 font-bold mt-2 uppercase tracking-wider">to the nearest ${match[2]}</div>`;
    }
    return `<div class="text-2xl">${item.prompt}</div>`;
  },

  renderPlain(item) {
    return item.prompt;
  },

  solve(item) {
    return item.answer;
  }
};
