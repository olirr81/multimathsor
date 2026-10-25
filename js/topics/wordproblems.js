function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default {
  id: 'wordproblems',
  nombre: 'Word Problems',
  nombreLargo: 'Understand & solve',
  icon: '📝',
  color: 'amber',

  levels() {
    return [
      { id: 'wp-add', label: 'Addition problems', group: 'Word Problems', inputMode: 'multi-step' },
      { id: 'wp-sub', label: 'Subtraction problems', group: 'Word Problems', inputMode: 'multi-step' },
      { id: 'wp-mixed', label: 'Mixed problems', group: 'Word Problems', inputMode: 'multi-step' }
    ];
  },

  generate(levelId) {
    let isAdd = false;
    if (levelId === 'wp-add') isAdd = true;
    else if (levelId === 'wp-sub') isAdd = false;
    else isAdd = Math.random() < 0.5; // Mixed

    let a, b, text, opStr, ans;

    if (isAdd) {
      a = randInt(1200, 4500);
      b = randInt(1200, 4500);
      ans = a + b;
      opStr = `${a} + ${b}`;
      const contexts = [
        `There are ${a} students in School A and ${b} students in School B. How many students are there altogether?`,
        `Leo has ${a} football stickers. He buys ${b} more. How many stickers does he have now?`,
        `A warehouse has ${a} boxes of toys. They receive ${b} more boxes. How many boxes do they have in total?`,
        `Amelia reads ${a} pages on Monday and ${b} pages on Tuesday. How many pages does she read altogether?`,
        `A shop sold ${a} ice creams on Saturday and ${b} on Sunday. How many ice creams did they sell in total?`
      ];
      text = pick(contexts);
    } else {
      a = randInt(3000, 8500);
      b = randInt(1000, a - 500);
      ans = a - b;
      opStr = `${a} - ${b}`;
      const contexts = [
        `A shop has ${a} LEGO sets. They sell ${b} sets. How many sets are left?`,
        `The library has ${a} books. ${b} books are borrowed. How many books are still in the library?`,
        `Tom has ${a} points in a game. He loses ${b} points. How many points does he have now?`,
        `A water tank holds ${a} litres of water. ${b} litres are used. How many litres are left?`,
        `A farmer has ${a} apples. He sells ${b} apples at the market. How many apples does he have left?`
      ];
      text = pick(contexts);
    }

    // Opciones para el paso 1
    const opAdd = `${a} + ${b}`;
    const opSub = `${a} - ${b}`;
    const opSubRev = `${b} - ${a}`;
    let choices = [opAdd, opSub, opSubRev];
    choices = choices.sort(() => Math.random() - 0.5); // Barajar

    return {
      prompt: text,
      answer: ans,
      steps: [
        {
          type: 'choice',
          prompt: 'Which calculation should you do?',
          choices: choices,
          answer: opStr
        },
        {
          type: 'numeric',
          prompt: 'Now calculate the answer:',
          answer: ans
        }
      ],
      meta: { a, b, isAdd }
    };
  },

  key(item) {
    return `${item.meta.a}-${item.meta.b}-${item.meta.isAdd}`;
  },

  render(item) {
    return `<div class="text-lg sm:text-xl font-bold text-white leading-snug text-center">${item.prompt}</div>`;
  },

  renderPlain(item) {
    return item.prompt;
  },

  solve(item) {
    return item.answer;
  }
};
