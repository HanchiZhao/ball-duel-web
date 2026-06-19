import { Game } from './game.js';
import { UIController } from './ui.js';

const canvas = document.getElementById('gameCanvas');
let ui;
const game = new Game(canvas, {
  onStatus: status => ui?.onGameStatus(status)
});
ui = new UIController(game);
ui.init();

window.ballDuelGame = game;
