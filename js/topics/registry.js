import tablas from './tablas.js';

// Todos los temas disponibles en la app.
// Para añadir uno nuevo: crear js/topics/sumas.js con la misma interfaz
// y añadirlo aquí.
const all = {
  tablas
  // sumas, restas, ...
};

export default all;

// Devuelve un tema por id
export function getTopic(id) {
  return all[id] || null;
}

// Lista de temas en orden "natural" (el orden que el padre define va aparte)
export function listTopics() {
  return Object.values(all);
}
