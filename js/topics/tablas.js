export default {
  id: 'tablas',
  nombre: 'Tablas',
  nombreLargo: 'Tablas de multiplicar',
  icon: '×',
  color: 'indigo',

  // Niveles que el padre puede marcar/desmarcar (1..12)
  levels() {
    const out = [];
    for (let i = 1; i <= 12; i++) {
      out.push({ id: i, label: `Tabla del ${i}` });
    }
    return out;
  },

  // Operaciones generadas a partir de los niveles activos
  units(activeLevels) {
    const out = [];
    const levels = (activeLevels && activeLevels.length) ? activeLevels : [1,2,3,4,5,6,7,8,9,10,11,12];
    for (const a of levels) {
      for (let b = 1; b <= 12; b++) out.push({ a, b });
    }
    return out;
  },

  render(op, colorClass = 'text-indigo-400') {
    return `<span>${op.a}</span> <span class="${colorClass}">×</span> <span>${op.b}</span>`;
  },

  renderPlain(op) { return `${op.a} × ${op.b}`; },
  solve(op) { return op.a * op.b; },
  key(op) { return `${op.a}-${op.b}`; },

  distractors(op, correct) {
    const s = new Set([correct]);
    s.add((op.a + 1) * op.b);
    s.add(op.a * Math.max(1, op.b - 1));
    s.add(op.a + op.b);
    while (s.size < 4) {
      const delta = (Math.floor(Math.random() * 5) + 1) * (Math.random() < 0.5 ? 1 : -1);
      s.add(Math.max(1, correct + delta));
    }
    return [...s].slice(0, 4).sort(() => Math.random() - 0.5);
  }
};
