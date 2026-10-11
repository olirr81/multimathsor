import tablas from './tablas.js';
import rounding from './rounding.js';

const all = {
  tablas,
  rounding
};

export default all;

export function getTopic(id) {
  return all[id] || null;
}

export function listTopics() {
  return Object.values(all);
}
