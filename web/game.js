import { randomInt, randomBytes } from 'node:crypto';

export const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
export const rooms = new Map();
const fail = message => { throw new Error(message); };
export function emptyBoard() { return { ships: [], shots: [] }; }
export function place(board, row, col, vertical) {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row > 9 || col > 9) fail('Выберите клетку поля.');
  const size = FLEET[board.ships.length];
  if (!size) fail('Все корабли уже расставлены.');
  const cells = Array.from({ length: size }, (_, i) => [row + (vertical ? i : 0), col + (vertical ? 0 : i)]);
  if (cells.some(([r,c]) => r > 9 || c > 9)) fail('Корабль выходит за границы поля.');
  if (cells.some(([r,c]) => board.ships.some(s => s.some(([sr,sc]) => Math.abs(sr-r) <= 1 && Math.abs(sc-c) <= 1)))) fail('Корабли не должны касаться друг друга.');
  board.ships.push(cells);
}
export function randomBoard() {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const board = emptyBoard();
    for (const size of FLEET) {
      let placed = false;
      for (let i = 0; i < 500; i++) {
        try { place(board, randomInt(10), randomInt(10), Boolean(randomInt(2))); placed = true; break; } catch {}
      }
      if (!placed) break;
    }
    if (board.ships.length === 10) return board;
  }
  fail('Не удалось расставить флот. Попробуйте снова.');
}
const hit = (board, r, c) => board.shots.some(s => s[0] === r && s[1] === c);
const sunk = (board, ship) => ship.every(([r,c]) => hit(board,r,c));
export function grid(board, reveal) {
  return Array.from({length:10}, (_,r) => Array.from({length:10}, (_,c) => {
    const ship = board.ships.find(s => s.some(([sr,sc]) => sr === r && sc === c));
    if (hit(board,r,c)) return ship ? (sunk(board,ship) ? 'sunk' : 'hit') : 'miss';
    return reveal && ship ? 'ship' : 'water';
  }));
}
export function newPlayer(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 24) fail('Введите имя: от 1 до 24 символов.');
  return { token: randomBytes(24).toString('hex'), name:name.trim(), board:emptyBoard(), ready:false };
}
export function create(name) {
  const player = newPlayer(name);
  let code;
  do { code = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
  const room = { code, players:[player], phase:'waiting', turn:0, winner:null, event:'Комната создана. Пригласите соперника.', updated:Date.now() };
  rooms.set(code,room);
  return {room,player};
}
export function join(code, name) {
  const room = rooms.get(String(code).trim().toUpperCase());
  if (!room) fail('Комната не найдена. Проверьте код.');
  if (room.players.length !== 1 || room.phase !== 'waiting') fail('Комната уже занята.');
  const player = newPlayer(name);
  room.players.push(player); room.phase='placement'; room.event='Соперник подключился. Расставьте флот.'; room.updated=Date.now();
  return {room,player};
}
export function authorize(code, token) {
  const room = rooms.get(code);
  if (!room) fail('Комната закрыта или сервер перезапущен.');
  const player = room.players.find(p => p.token === token);
  if (!player) fail('Нет доступа к комнате.');
  return {room,player};
}
export function view(room, player) {
  const opponent = room.players.find(p => p !== player);
  const summary = p => ({name:p.name, ready:p.ready, alive:p.board.ships.filter(s => !sunk(p.board,s)).length});
  return { code:room.code, phase:room.phase, event:room.event, myTurn:room.players[room.turn] === player,
    winner:room.winner === null ? null : room.players[room.winner].name,
    won:room.winner !== null && room.players[room.winner] === player,
    me:{...summary(player), placed:player.board.ships.length, grid:grid(player.board,true)},
    opponent:opponent ? {...summary(opponent), grid:grid(opponent.board,room.phase === 'finished')} : null };
}
export function action(room, player, data) {
  const index = room.players.indexOf(player);
  if (data.action === 'surrender') {
    if (!['placement','battle'].includes(room.phase)) fail('Игра ещё не началась или уже завершена.');
    room.phase='finished'; room.winner=1-index; room.event=`${player.name} сдаётся.`;
  } else if (data.action === 'shoot') {
    if (room.phase !== 'battle' || room.turn !== index) fail('Сейчас нельзя стрелять. Дождитесь своего хода.');
    const {row:r,col:c} = data;
    if (![r,c].every(n => Number.isInteger(n) && n >= 0 && n < 10)) fail('Некорректная координата.');
    const board = room.players[1-index].board;
    if (hit(board,r,c)) fail('Вы уже стреляли в эту клетку.');
    board.shots.push([r,c]);
    const ship = board.ships.find(s => s.some(([sr,sc]) => sr === r && sc === c));
    let result = 'промах';
    if (!ship) room.turn=1-index;
    else if (!sunk(board,ship)) result='попадание! Стреляйте ещё раз';
    else {
      result='корабль потоплен!';
      for (const [sr,sc] of ship) for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
        const nr=sr+dr,nc=sc+dc;
        if (nr>=0 && nr<10 && nc>=0 && nc<10 && !hit(board,nr,nc)) board.shots.push([nr,nc]);
      }
      if (board.ships.every(s => sunk(board,s))) { room.phase='finished'; room.winner=index; }
    }
    room.event=`${player.name}: ${'ABCDEFGHIJ'[c]}${r+1} — ${result}`;
  } else {
    if (room.phase !== 'placement' || player.ready) fail('Расстановка сейчас недоступна.');
    if (data.action === 'random') player.board=randomBoard();
    else if (data.action === 'clear') player.board=emptyBoard();
    else if (data.action === 'place') place(player.board,data.row,data.col,data.vertical === true);
    else if (data.action === 'ready') {
      if (player.board.ships.length !== 10) fail('Сначала расставьте все 10 кораблей.');
      player.ready=true;
      if (room.players.every(p => p.ready)) { room.phase='battle'; room.turn=randomInt(2); room.event=`Бой начался. Первым стреляет ${room.players[room.turn].name}.`; }
    } else fail('Неизвестное действие.');
  }
  room.updated=Date.now();
}
