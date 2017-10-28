const R = require('ramda');
const Chance = require('chance');
const logger = require('./log');

// constants
const WIDTH = 1280;
const HEIGHT = 768;
const PLAYER_SPEED = 80;
const MAX_SEGMENTS = 40;
const DISPLAY = 'display';
const TICK_RATE = 500;
const STEERING_SPEED = 0.3;
const STARTING_AREA_HORIZONTAL = 30;
const STARTING_AREA_VERTICAL = 30;
const CENTER = {
  x: WIDTH * 0.5,
  y: HEIGHT * 0.5
};

const COLORS = ['#EF476F', '#06D6A0', '#FFD166', '#00C0FF', '#003559'];

//
const chance = new Chance();

// List of userPoints { 'aaaa': [{x,y,direction},{x,y,direction},{x,y,direction}], ...}
let players = {};

//
let unpickedColors = [];

// 
let lastTick = null;

//
let displaySocket = null;

//
let gameRunning = true;

//
let delta = 0;

//********************************************************************************
// HELPER
//********************************************************************************
/**
 *
 */
function checkScreenBoundingBox(point) {
  const outsideHorizontal = point.x > WIDTH || point.x < 0;
  const outsideVertical = point.y > HEIGHT || point.y < 0;
  return outsideHorizontal || outsideVertical;
}

function checkPlayerCollision(id, playerLine) {

  for (const otherId in players) {
    if (otherId === id) continue;

    const player = players[otherId];
    if (playerLine.length < 2 || player.points.length < 2) return;
    const otherLine = player.points;

    const collide = linesCollide(playerLine, otherLine);

    if (collide) {
      return {
        deadPlayer  : id,
        collide     : true,
        collidedWith: otherId
      };
    }
  }

  return null;
}

/**
 *
 */
function radToDeg(rad) {
  return rad * 180 / Math.PI;
}

/**
 *
 */
function degToRad(deg) {
  return deg * Math.PI / 180;
}

function linesCollide(lineA, lineB) {
  for (let k = lineA.length - 1; k >= 1; k--) {
    for (let j = lineB.length - 1; j >= 1; j--) {
      const lineASegment = {from: lineA[k - 1], to: lineA[k]};
      const lineBSegment = {from: lineB[j - 1], to: lineB[k]};
      if (segmentIntersection(
          lineASegment.from,
          lineASegment.to,
          lineBSegment.from,
          lineBSegment.to
        )) {
        return true;
      }
    }
  }
  return false;
}

function segmentIntersection(P1From, P1To, P2From, P2To) {

  // if the lines intersect, the result contains the x and y of the intersection (treating the lines as infinite) and booleans for whether line segment 1 or line segment 2 contain the point
  let denominator, a, b, numerator1, numerator2, result = {
    x      : null,
    y      : null,
    onLine1: false,
    onLine2: false
  };
  denominator = ((P2To.y - P2From.y) * (P1To.x - P1From.x)) - ((P2To.x - P2From.x) * (P1To.y - P1From.y));
  if (denominator === 0) {
    return false;
  }
  a = P1From.y - P2From.y;
  b = P1From.x - P2From.x;
  numerator1 = ((P2To.x - P2From.x) * a) - ((P2To.y - P2From.y) * b);
  numerator2 = ((P1To.x - P1From.x) * a) - ((P1To.y - P1From.y) * b);
  a = numerator1 / denominator;
  b = numerator2 / denominator;

  // if we cast these lines infinitely in both directions, they intersect here:
  result.x = P1From.x + (a * (P1To.x - P1From.x));
  result.y = P1From.y + (a * (P1To.y - P1From.y));
  /*
          // it is worth noting that this should be the same as:
          x = P2From.x + (b * (P2To.x - P2From.x));
          y = P2From.x + (b * (P2To.y - P2From.y));
          */
  // if line1 is a segment and line2 is infinite, they intersect if:
  if (a > 0 && a < 1) {
    result.onLine1 = true;
  }
  // if line2 is a segment and line1 is infinite, they intersect if:
  if (b > 0 && b < 1) {
    result.onLine2 = true;
  }
  // if line1 and line2 are segments, they intersect if both of the above are true
  return result.onLine1 && result.onLine2;
}

// /**
//  * 
//  */
// function lineIntersection(P, r, Q, s) {
//   // line1 = P + lambda1 * r
//   // line2 = Q + lambda2 * s
//   // r and s must be normalized (length = 1)
//   // returns intersection point O of line1 with line2 = [ Ox, Oy ] 
//   // returns null if lines do not intersect or are identical
//   var PQx = Q.x - P.x;
//   var PQy = Q.y - P.y;
//   var rx = r.x;
//   var ry = r.y;
//   var rxt = -ry;
//   var ryt = rx;
//   var qx = PQx * rx + PQy * ry;
//   var qy = PQx * rxt + PQy * ryt;
//   var sx = s.x * rx + s.y * ry;
//   var sy = s.x * rxt + s.y * ryt;
//   // if lines are identical or do not cross...
//   if (sy == 0) return false;
//   const a = qx - qy * sx / sy;
//   return {
//     x: P.x + a * rx,
//     y: P.y + a * ry
//   };
// }

/**
 *
 */
function randomPosition() {
  const startLeft = chance.bool();
  const startTop = chance.bool();

  let position = {};

  const startSector = chance.pickone(['left', 'right', 'top', 'bottom']);

  switch (startSector) {
    case 'left':
      position = {
        x: 0,
        y: chance.integer({
          min: STARTING_AREA_VERTICAL,
          max: HEIGHT - STARTING_AREA_VERTICAL
        })
      };
      break;
    case 'right':
      position = {
        x: WIDTH,
        y: chance.integer({
          min: STARTING_AREA_VERTICAL,
          max: HEIGHT - STARTING_AREA_VERTICAL
        })
      };
      break;
    case 'top':
      position = {
        x: chance.integer({
          min: STARTING_AREA_HORIZONTAL,
          max: WIDTH - STARTING_AREA_HORIZONTAL
        }),
        y: 0
      };
      break;
    case 'bottom':
      position = {
        x: chance.integer({
          min: STARTING_AREA_HORIZONTAL,
          max: WIDTH - STARTING_AREA_HORIZONTAL
        }),
        y: HEIGHT
      };
      break;
  }

  return position;
}

/**
 * Direction in radians
 */
function randomDirection(from) {
  const translatedCenter = {
    x: CENTER.x - from.x,
    y: CENTER.y - from.y
  };

  return Math.atan2(translatedCenter.y, translatedCenter.x);
}

function vectorFromAngle(rad) {
  return {
    x: Math.cos(rad),
    y: Math.sin(rad)
  };
}

function getColor() {
  if (unpickedColors.length > 0) {
    const color = chance.pickone(unpickedColors);
    unpickedColors = R.without(color, unpickedColors);
    return color;
  } else {
    return chance.color({
      format: 'hex'
    });
  }
}

/**
 *
 */
function resetGame() {
  unpickedColors = COLORS;

  // Reset history for every player
  R.forEachObjIndexed(function (player) {
    player.points = [];
    player.dead = false;
    player.color = getColor();
  }, players);
}

module.exports = function configureSocketIO(io, app) {
  //********************************************************************************
  // FROM CLIENT EVENTS
  //********************************************************************************
  /**
   *
   */
  function clientConnected(socket) {
    const id = socket.id;
    const type = socket.handshake.query.type || 'player';
    socket.type = type;

    if (type === DISPLAY) {
      //resetGame(); TODO UNCOMMENT THIS AGAIN

      displaySocket = socket;
      displaySocket.on('disconnect', displayDisconnected);
      displaySocket.on('displayCreated', displayCreated);
      displaySocket.on('startGame', displayStartedGame);
      displaySocket.on('stopGame', displayStoppedGame);

      displaySocket.emit('playerList', players);
    } else {
      let name = socket.handshake.query.name || chance.name();
      logger.info(`${type} connected ${id} ${name}`);

      if (type === 'bot') {
        name = '(BOT)' + name;
      }

      // Attach events to socket
      socket.on('disconnect', clientDisconnected(socket));
      socket.on('changeDirection', clientChangedDirection(socket));

      // Add a new player to players object
      players[id] = {
        name  : name,
        color : getColor(),
        points: [],
        isBot : type === 'bot'
      };

      socket.emit('connectionSuccess', players[id]);

      if (gameRunning) {
        // Place player random on the map
        const position = randomPosition();
        const direction = randomDirection(position);

        players[id].direction = direction;
        players[id].points = [{position, direction}];
      }

      // Notify everyone about the new player and his position
      someoneJoined(id, players[id]);
    }
  }

  /**
   *
   */
  function clientDisconnected(socket) {
    return function () {
      const id = socket.id;
      logger.info(`${socket.type} disconnected ${id}`);

      // Remove user from players list
      players = R.pickBy(function (value, key) {
        return key !== id;
      }, players);

      //// If display disconnects reset everything
      //if (socket.type === 'display') {
      //  displaySocket = null;
      //  gameRunning = false;
      //  resetGame();
      //}

      // Notify everyone about the player who left
      someoneLeft(id);
    };
  }

  /**
   *
   */
  function clientChangedDirection(socket) {
    return function (rad) {
      const id = socket.id;
      const last = players[id].direction || 0;
      players[id].direction = last + (rad * delta * STEERING_SPEED);
    };
  }

  function displayDisconnected() {
    logger.info('Display disconnected');
    gameRunning = false;
    resetGame();

    // Reset history for every player
    R.forEachObjIndexed(function (player, id) {
      io.to(id).emit('changeColor', player.color);
    }, players);
  }

  /**
   *
   */
  function displayCreated(socket) {
    logger.info('Display is initialized');
  }

  /**
   *
   */
  function displayStartedGame() {
    if (gameRunning) return;
    logger.info('Display started game');
    gameRunning = true;
    resetGame();

    // Set initial position for every player
    R.forEachObjIndexed(function (player, id) {
      // Place player random on the map
      const position = randomPosition();
      const direction = randomDirection(position);

      logger.info(`Place player ${id} ${position} ${direction}`);

      const point = {
        position,
        direction
      };

      player.direction = direction;
      player.points.push(point);
    }, players);

    logger.info(players);
  }

  /**
   *
   */
  function displayStoppedGame() {
    if (!gameRunning) return;
    logger.info('Display stopped game');
    gameRunning = false;
  }

  //********************************************************************************
  // TO FRONTEND EVENTS
  //********************************************************************************
  /**
   *
   */
  function someoneJoined(id, player) {
    io.emit('joined', {
      id,
      player
    });
  }

  /**
   *
   */
  function someoneLeft(id) {
    io.emit('left', {
      id
    });
  }

  /**
   *
   */
  function collisionOccured() {
    io.emit('collision');
  }

  /**
   *
   */
  function tick() {

    if (lastTick) {
      delta = (Date.now() - lastTick) / 1000.0;
    }

    if (gameRunning) {
      const diffs = {};

      R.forEachObjIndexed(function (player, key) {
        if (player.dead) return;

        const lastPoint = R.last(player.points);
        if (!lastPoint) return;

        if (player.isBot) {
          const last = player.direction || 0;
          const direction = chance.bool() ? -1 : 1;
          player.direction = last + (direction * delta * STEERING_SPEED);
        }

        // Calculate x,y vec from angle
        const dv = vectorFromAngle(player.direction);

        // Create translation vector
        const tx = lastPoint.position.x + (PLAYER_SPEED * dv.x * delta);
        const ty = lastPoint.position.y + (PLAYER_SPEED * dv.y * delta);

        // Create a new point
        const newPoint = {
          position : {x: tx, y: ty},
          direction: player.direction
        };

        // Check if new point is ouf screen bounds
        const pointOutsideScreen = checkScreenBoundingBox(newPoint.position);
        if (pointOutsideScreen) {
          logger.info(`${key} outside screen`);
          player.dead = true;
          player.points = [];
          if (displaySocket) displaySocket.emit('collision', {deadPlayer: key});
          return;
        }

        // Check for player collision
        const collision = checkPlayerCollision(key, player.points);
        if (collision) {
          logger.info(`${key} collision`);
          player.dead = true;
          player.points = [];
          if (displaySocket) displaySocket.emit('collision', collision);
          return;
        }

        // Add newPoint in diff object for later client update
        diffs[key] = newPoint;

        // Add this newPoint to history
        player.points.push(newPoint);
        if (player.points.length > MAX_SEGMENTS) {
          player.points.splice(0, 1);
        }
      }, players);

      // Send tick
      io.emit('tick', {
        lastTick,
        delta,
        diffs
      });
    }

    lastTick = Date.now();
  }

  //********************************************************************************
  // EVENT MAPPING
  //********************************************************************************
  io.on('connection', clientConnected);
  const tickID = setInterval(tick, TICK_RATE);

  app.get('/', function (req, res) {
    const playerList = R.values(R.map((value) => {
      return {
        name: value.name, dead: value.dead
      };
    }, players));

    const result = {players: playerList, count: playerList.length};

    res.json(result);
  });
};