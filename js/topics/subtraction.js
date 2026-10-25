function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatVertical(a, b, op) {
  const aStr = String(a);
  const bStr = String(b);
  
  const paddedA = '  ' + aStr.split('').join(' ');
  const paddedB = op + ' ' + bStr.split('').join(' ');
  const line = '─'.repeat(paddedB.length + 1);
  
  return `<div class="text-4xl sm:text-5xl font-mono leading-tight tracking-wider text-white whitespace-pre text-left my-4">${paddedA}\n${paddedB}\n${line}</div>`;
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
        // Requiere préstamo en unidades
        if (aO < bO && aT > bT) isValid = true;
        
      } else if (levelId === 'sub-4d') {
        a = randInt(3000, 9000);
        b = randInt(1000, a - 100);
        const aO = a % 10, bO = b % 10;
        const aT = Math.floor(a / 10) % 10, bT = Math.floor(b / 10) % 10;
        const aH = Math.floor(a / 100) % 10, bH = Math.floor(b / 100) % 10;
        // Requiere préstamo en varias columnas
        if (aO < bO && aT <= bT && aH >= bH) isValid = true;
        
      } else {
        // Subtracting across zeros (ej. 6000 - 3286)
        const thousands = randInt(3, 9);
        a = thousands * 1000;
        b = randInt(1000, a - 500);
        // Aseguramos que haya ceros
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
    // Distractores típicos: errores al pedir prestado
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
