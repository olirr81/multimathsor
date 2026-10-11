import tablas from './tablas.js';
import rounding from './rounding.js';
import numbers from './numbers.js';

const all = {
  tablas,
  rounding,
  numbers
};

export default all;

export function getTopic(id) {
  return all[id] || null;
}

export function listTopics() {
  return Object.values(all);
}
