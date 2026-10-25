function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Genera una tabla HTML perfecta para alinear las operaciones
function formatVertical(a, b, op) {
  // Rellenamos con espacios a la izquierda hasta tener 4 dígitos (para alinear miles)
  const aDigits = String(a).padStart(4, ' ').split('');
  const bDigits = String(b).padStart(4, ' ').split('');

  let html = '<table class="mx-auto text-4xl sm:text-5xl font-mono font-bold text-white border-collapse my-4">';
  html += '<tbody>';
  
  // Fila 1 (Número A)
  html += '<tr>';
  html += `<td class="px-1 sm:px-2 text-right opacity-0">${op}</td>`; // Celda invisible para alinear
  aDigits.forEach(d => {
    html += `<td class="px-1 sm:px-2 text-center w-10 sm:w-14">${d === ' ' ? '&nbsp;' : d}</td>`;
  });
  html += '</tr>';

  // Fila 2 (Operador y Número B)
  html += '<tr>';
  html += `<td class="px-1 sm:px-2 text-right text-2xl sm:text-3xl pb-1">${op}</td>`;
  bDigits.forEach(d => {
    html += `<td class="px-1 sm:px-2 text-center w-10 sm:w-14">${d === ' ' ? '&nbsp;' : d}</td>`;
  });
  html += '</tr>';

  // Fila 3 (Línea divisoria)
  html += '<tr>';
  html += `<td colspan="5" class="border-t-4 border-slate-500 pt-2"></td>`;
  html += '</tr>';

  html += '</tbody></table>';
  return html;
}

export default {
  id: 'addition',
  nombre: 'Addition',
  nombreLargo: 'Adding with renaming',
  icon: '+',
  color: 'sky',

  levels() {
    return [
      { id: 'add-3d', label: '3-digit + 3-digit', group: 'Addition', inputMode: 'numeric' },
      { id: 'add-4d', label: '4-digit + 4-digit', group: 'Addition', inputMode: 'numeric' },
      { id: 'add-4d-multi', label: 'Multiple renaming', group: 'Addition', inputMode: 'numeric' }
    ];
  },

  generate(levelId) {
    let a, b, isValid = false;
    
    while (!isValid) {
      if (levelId === 'add-3d') {
        a = randInt(100, 999);
        b = randInt(100, 999);
        const aO = a % 10, bO = b % 10;
        const aT = Math.floor(a / 10) % 10, bT = Math.floor(b / 10) % 10;
        const aH = Math.floor(a / 100), bH = Math.floor(b / 100);
        if (aO + bO >= 10 && aT + bT + 1 < 10 && aH + bH < 10) isValid = true;
        
      } else if (levelId === 'add-4d') {
        a = randInt(1000, 8000);
        b = randInt(1000, 9999 - a);
        const aO = a % 10, bO = b % 10;
        const aT = Math.floor(a / 10) % 10, bT = Math.floor(b / 10) % 10;
        const aH = Math.floor(a / 100) % 10, bH = Math.floor(b / 100) % 10;
        if (aO + bO >= 10 && aT + bT + 1 < 10 && aH + bH < 10) isValid = true;
        
      } else {
        a = randInt(1000, 8000);
        b = randInt(1000, 9999 - a);
        const aO = a % 10, bO = b % 10;
        const aT = Math.floor(a / 10) % 10, bT = Math.floor(b / 10) % 10;
        if (aO + bO >= 10 && aT + bT + 1 >= 10) isValid = true;
      }
    }

    return {
      prompt: formatVertical(a, b, '+'),
      answer: a + b,
      meta: { a, b }
    };
  },

  key(item) {
    return `${item.meta.a}-${item.meta.b}`;
  },

  render(item) {
    return item.prompt;
  },

  renderPlain(item) {
    return `${item.meta.a} + ${item.meta.b}`;
  },

  solve(item) {
    return item.answer;
  },

  distractors(item) {
    const s = new Set([item.answer]);
    s.add(item.answer - 10);
    s.add(item.answer + 100);
    s.add(item.answer - 1);
    
    while (s.size < 4) {
      const delta = (Math.floor(Math.random() * 5) + 1) * (Math.random() < 0.5 ? 1 : -1);
      s.add(Math.max(1, item.answer + delta));
    }
    return [...s].slice(0, 4).sort(() => Math.random() - 0.5);
  }
};
