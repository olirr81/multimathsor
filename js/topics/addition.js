function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Genera un layout vertical bonito para sumas
function formatVertical(a, b, op) {
  const aStr = String(a);
  const bStr = String(b);
  
  const paddedA = '  ' + aStr.split('').join(' ');
  const paddedB = op + ' ' + bStr.split('').join(' ');
  const line = '─'.repeat(paddedB.length + 1);
  
  return `<div class="text-4xl sm:text-5xl font-mono leading-tight tracking-wider text-white whitespace-pre text-left my-4">${paddedA}\n${paddedB}\n${line}</div>`;
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
        // Exige llevada en unidades, pero no en decenas ni centenas
        if (aO + bO >= 10 && aT + bT + 1 < 10 && aH + bH < 10) isValid = true;
        
      } else if (levelId === 'add-4d') {
        a = randInt(1000, 8000);
        b = randInt(1000, 9999 - a);
        const aO = a % 10, bO = b % 10;
        const aT = Math.floor(a / 10) % 10, bT = Math.floor(b / 10) % 10;
        const aH = Math.floor(a / 100) % 10, bH = Math.floor(b / 100) % 10;
        // Llevada en unidades, pero no en decenas ni centenas
        if (aO + bO >= 10 && aT + bT + 1 < 10 && aH + bH < 10) isValid = true;
        
      } else {
        a = randInt(1000, 8000);
        b = randInt(1000, 9999 - a);
        const aO = a % 10, bO = b % 10;
        const aT = Math.floor(a / 10) % 10, bT = Math.floor(b / 10) % 10;
        // Llevada en unidades y decenas (múltiples)
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
    // Distractores típicos: sumar mal las llevadas
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
