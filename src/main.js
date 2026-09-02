// Dimensional Awakening — entry. The core lives in game.js; every place in the
// universe beyond the room lives in src/regions/ and registers itself on import.
import {start} from './game.js';
import './regions/index.js';
start();
