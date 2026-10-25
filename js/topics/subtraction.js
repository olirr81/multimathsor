function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Genera una tabla HTML perfecta para alinear las operaciones
function formatVertical(a, b, op) {
  const aDigits = String(a).padStart(4, ' ').split('');
  const bDigits = String(b).padStart(4, ' ').split('');

  let html = '<table class="mx-auto text-4xl sm:text-5xl font-mono font-bold text-white border-collapse my-4">';
  html += '<tbody>';
  
  // Fila 1 (Número A)
  html += '<tr>';
  html += `<td class="px-1 sm:px-2 text-right opacity-0">${op}</td>`;
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
  id: 'subtraction',
  nombre: 'Subtraction',
  nombreLargo: 'Subtracting with renaming',
  icon: '−',
  color: 'rose',

  levels() {
    return [
      { id: 'sub-renaming', label: 'Renaming', group: 'Subtraction', inputMode: 'numeric' },
      { id: 'sub-4d', label: '4-digit renaming', group: 'Subtraction', inputMode: 'numeric' },
      { id: 'sub-zeros', label: 'Subtracting across zeros', group: 'Subtraction', inputMode: 'numeric' }
    ];
  },

  generate(levelId) {
    let a, b, isValid = false;
    
    while (!isValid) {
      if (levelId === 'sub-renaming') {
        a = randInt(2000, 9000);
        b = randInt(100, a - 100);
        const aO = a % 10, bO = b % 10;
        const aT = Math.floor(a / 10) % 10, bT = Math.floor(b / 10) % 10;
        if (aO < bO && aT > bT) isValid = true;
        
      } else if (levelId === 'sub-4d') {
        a = randInt(3000, 9000);
        b = randInt(1000, a - 100);
        const aO = a % 10, bO = b % 10;
        const aT = Math.floor(a / 10) % 10, bT = Math.floor(b / 10) % 10;
        const aH = Math.floor(a / 100) % 10, bH = Math.floor(b / 100) % 10;
        if (aO < bO && aT <= bT && aH >= bH) isValid = true;
        
      } else {
        const thousands = randInt(3, 9);
        a = thousands * 1000;
        b = randInt(1000, a - 500);
        if (a % 1000 < 500) isValid = true;
      }
    }

    return {
      prompt: formatVertical(a, b, '−'),
      answer: a - b,
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
    return `${item.meta.a} - ${item.meta.b}`;
  },

  solve(item) {
    return item.answer;
  },

  distractors(item) {
    const s = new Set([item.answer]);
    s.add(item.answer + 10);
    s.add(item.answer - 100);
    s.add(item.answer + 1);
    
    while (s.size < 4) {
      const delta = (Math.floor(Math.random() * 5) + 1) * (Math.random() < 0.5 ? 1 : -1);
      s.add(Math.max(1, item.answer + delta));
    }
    return [...s].slice(0, 4).sort(() => Math.random() - 0.5);
  }
};
