import { compare } from './engine.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, result: compare(data.config, data.overrides) }); }
  catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
