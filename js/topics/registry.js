import tablas from './tablas.js';
import rounding from './rounding.js';
import numbers from './numbers.js';
import addition from './addition.js';
import subtraction from './subtraction.js';
import wordproblems from './wordproblems.js';

const all = {
  tablas,
  rounding,
  numbers,
  addition,
  subtraction,
  wordproblems
};

export default all;

export function getTopic(id) {
  return all[id] || null;
}

export function listTopics() {
  return Object.values(all);
}
