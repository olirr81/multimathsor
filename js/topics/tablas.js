function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default {
  id: 'tablas',
  nombre: 'Tablas',
  nombreLargo: 'Tablas de multiplicar',
  icon: '×',
  color: 'indigo',

  // Todos los niveles son numéricos
  levels() {
    const out = [];
    for (let i = 1; i <= 12; i++) {
      out.push({
        id: i,
        label: `Tabla del ${i}`,
        group: 'Tablas',
        inputMode: 'numeric'
      });
    }
    return out;
  },

  // Genera un enunciado a partir de un id de nivel (1..12)
  generate(levelId) {
    const a = levelId;
    const b = randInt(1, 12);
    return {
      prompt: `${a} × ${b}`,
      answer: a * b,
      meta: { a, b }
    };
  },

  // Para el motor adaptativo: identifica unívocamente la operación
  // (usa meta si está disponible, si no el enunciado)
  key(item) {
    if (item.meta) return `${item.meta.a}-${item.meta.b}`;
    return String(item.prompt);
  },

  // Render bonito del enunciado (opcional, para ampliar)
  render(item, colorClass = 'text-indigo-400') {
    if (item.meta) {
      return `<span>${item.meta.a}</span> <span class="${colorClass}">×</span> <span>${item.meta.b}</span>`;
    }
    return `<span>${item.prompt}</span>`;
  },

  renderPlain(item) {
    return item.prompt;
  },

  solve(item) {
    return item.answer;
  }
};
