function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Formatea con coma de miles: 4728 → "4,728"
function fmt(n) {
  return n.toLocaleString('en-GB');
}

// Construye los dígitos de un número de 4 cifras como objeto {thousands, hundreds, tens, ones}
function digitsOf(n) {
  return {
    thousands: Math.floor(n / 1000) % 10,
    hundreds: Math.floor(n / 100) % 10,
    tens: Math.floor(n / 10) % 10,
    ones: n % 10
  };
}

const PLACE_NAMES = ['thousands', 'hundreds', 'tens', 'ones'];
const PLACE_VALUES = { thousands: 1000, hundreds: 100, tens: 10, ones: 1 };

export default {
  id: 'numbers',
  nombre: 'Numbers',
  nombreLargo: 'Place value, compare & patterns',
  icon: '123',
  color: 'emerald',

  levels() {
    return [
      // Bloque 1: Place Value
      { id: 'pv-value',      label: 'Value of a digit',   group: 'Place Value',   inputMode: 'numeric' },
      { id: 'pv-decompose',  label: 'Decompose',          group: 'Place Value',   inputMode: 'numeric' },
      { id: 'pv-compose',    label: 'Compose',            group: 'Place Value',   inputMode: 'numeric' },
      { id: 'pv-whichplace', label: 'Which place?',       group: 'Place Value',   inputMode: 'choice' },

      // Bloque 2: Compare & Order
      { id: 'co-greatest',   label: 'Greatest number',    group: 'Compare & Order', inputMode: 'choice' },
      { id: 'co-smallest',   label: 'Smallest number',    group: 'Compare & Order', inputMode: 'choice' },
      { id: 'co-symbol',     label: '< > =',              group: 'Compare & Order', inputMode: 'choice' },

      // Bloque 3: Patterns
      { id: 'pat-more',      label: 'More than',          group: 'Number patterns', inputMode: 'numeric' },
      { id: 'pat-less',      label: 'Less than',          group: 'Number patterns', inputMode: 'numeric' }
    ];
  },

  generate(levelId) {
    if (levelId === 'pv-value') {
      const n = randInt(1000, 9999);
      const d = digitsOf(n);
      // Elige una posición con dígito distinto de cero
      const positions = PLACE_NAMES.filter(p => d[p] !== 0);
      const pos = pick(positions);
      const digit = d[pos];
      const value = digit * PLACE_VALUES[pos];
      return {
        prompt: `In ${fmt(n)}, the digit ${digit} stands for`,
        answer: value,
        meta: { n, pos, digit }
      };
    }

    if (levelId === 'pv-decompose') {
      const n = randInt(1000, 9999);
      const d = digitsOf(n);
      // Elige una posición con dígito distinto de cero para ocultar
      const positions = PLACE_NAMES.filter(p => d[p] !== 0);
      const pos = pick(positions);
      const hidden = d[pos] * PLACE_VALUES[pos];
      // Construye la expansión completa
      const parts = PLACE_NAMES
        .map(p => d[p] * PLACE_VALUES[p])
        .filter(v => v > 0);
      const partsStr = parts.map(v => v === hidden ? '___' : v).join(' + ');
      return {
        prompt: `${fmt(n)} = ${partsStr}`,
        answer: hidden,
        meta: { n, pos, hidden }
      };
    }

    if (levelId === 'pv-compose') {
      const n = randInt(1000, 9999);
      const d = digitsOf(n);
      const parts = PLACE_NAMES
        .map(p => d[p] * PLACE_VALUES[p])
        .filter(v => v > 0);
      const partsStr = parts.join(' + ');
      return {
        prompt: `${partsStr} =`,
        answer: n,
        meta: { n }
      };
    }

    if (levelId === 'pv-whichplace') {
      const n = randInt(1000, 9999);
      const d = digitsOf(n);
      const positions = PLACE_NAMES.filter(p => d[p] !== 0);
      const pos = pick(positions);
      const digit = d[pos];
      return {
        prompt: `In ${fmt(n)}, the digit ${digit} is in the`,
        answer: pos,
        choices: ['thousands', 'hundreds', 'tens', 'ones'],
        meta: { n, pos, digit }
      };
    }

    if (levelId === 'co-greatest' || levelId === 'co-smallest') {
      // Genera 4 números distintos, de 3-4 cifras, con dígitos mezclados
      const numbers = new Set();
      while (numbers.size < 4) {
        numbers.add(randInt(1000, 9999));
      }
      const arr = [...numbers];
      const target = levelId === 'co-greatest' ? Math.max(...arr) : Math.min(...arr);
      const label = levelId === 'co-greatest' ? 'Which is the greatest number?' : 'Which is the smallest number?';
      const choices = arr.map(n => fmt(n)).sort(() => Math.random() - 0.5);
      return {
        prompt: label,
        answer: fmt(target),
        choices,
        meta: { arr, target }
      };
    }

    if (levelId === 'co-symbol') {
      // Genera dos números con dígitos similares para forzar comparación real
      const base = randInt(100, 999);
      const variants = [base, base, base];
      // Crea dos números que compartan dígitos pero estén en orden distinto
      const a = randInt(100, 999);
      let b;
      do {
        b = randInt(100, 999);
      } while (a === b);
      const correct = a > b ? '>' : a < b ? '<' : '=';
      return {
        prompt: `${a}  ___  ${b}`,
        answer: correct,
        choices: ['<', '>', '='],
        meta: { a, b }
      };
    }

    if (levelId === 'pat-more' || levelId === 'pat-less') {
      const step = pick([1, 10, 100, 1000]);
      const base = randInt(1000, 9000);
      const isMore = levelId === 'pat-more';
      const answer = isMore ? base + step : base - step;
      return {
        prompt: `${step} ${isMore ? 'more' : 'less'} than ${fmt(base)} is`,
        answer,
        meta: { base, step, isMore }
      };
    }

    return { prompt: '?', answer: 0 };
  },

  // Distractores inteligentes para el modo Quiz
  distractors(item) {
    const correct = item.answer;
    if (typeof correct !== 'number') return null;
    const s = new Set([correct]);

    // Error típico 1: confundir el dígito (para place value)
    if (item.meta?.digit !== undefined && item.meta?.pos) {
      const wrongPos = PLACE_NAMES.find(p => p !== item.meta.pos);
      s.add(item.meta.digit * PLACE_VALUES[wrongPos]);
    }

    // Error típico 2: paso equivocado en patterns
    if (item.meta?.step) {
      s.add(item.meta.isMore ? item.meta.base + item.meta.step * 10 : item.meta.base - item.meta.step * 10);
    }

    // Relleno
    while (s.size < 4) {
      const magnitude = Math.max(1, Math.floor(Math.abs(correct) * 0.1));
      const delta = (Math.floor(Math.random() * 3) + 1) * magnitude * (Math.random() < 0.5 ? 1 : -1);
      const candidate = correct + delta;
      if (candidate >= 0) s.add(candidate);
    }

    return [...s].slice(0, 4).sort(() => Math.random() - 0.5);
  },

  key(item) {
    if (item.meta?.n) return String(item.meta.n);
    if (item.meta?.a !== undefined && item.meta?.b !== undefined) return `${item.meta.a}-${item.meta.b}`;
    if (item.meta?.base !== undefined) return `${item.meta.base}-${item.meta.step}-${item.meta.isMore}`;
    return String(item.prompt);
  },

  // Render del prompt: más grande, con la línea "___" destacada
  render(item) {
    // Para prompts con "= ___" o "___" o "is" al final, los partimos en dos líneas
    const prompt = item.prompt;

    // Prompt corto y sin formato especial
    if (prompt.length <= 40) {
      return `<div class="text-2xl sm:text-3xl font-black text-white text-center leading-tight">${prompt}</div>`;
    }

    // Prompt largo: el número principal grande y el resto debajo
    return `<div class="text-xl sm:text-2xl font-black text-white text-center leading-tight">${prompt}</div>`;
  },

  renderPlain(item) {
    return item.prompt;
  },

  solve(item) {
    return item.answer;
  }
};
