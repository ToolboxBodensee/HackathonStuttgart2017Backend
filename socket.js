const R = require('ramda');
const Chance = require('chance');

// constants
const WIDTH = 1280;
const HEIGHT = 768;
const PLAYER_SPEED = 40;
const DISPLAY = 'display';
const TICK_RATE = 500;
const STEERING_SPEED = 0.2;
const STARTING_AREA_HORIZONTAL = 30;
const STARTING_AREA_VERTICAL = 30;
const CENTER = {
  x: WIDTH * 0.5,
  y: HEIGHT * 0.5
};
const COLORS = ['red', 'green', 'yellow', 'orange', 'cyan'];

const DEV = process.env.NODE_ENV !== 'prod';

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

function checkPlayerCollision(id, lastPosition, newPosition) {

  for (const otherId in players) {
    if (otherId === id) continue;

    const player = players[otherId];
    if (player.points.length < 2) return;

    for (let i = player.points.length - 1; i >= 1; i--) {
      const checkNewPosition = player.points[i].position;
      const checkLastPosition = player.points[i - 1].position;

      if (lineIntersection(
          lastPosition.x, lastPosition.y,
          newPosition.x, newPosition.y,
          checkLastPosition.x, checkLastPosition.y,
          checkNewPosition.x, checkNewPosition.y
        )) {
        return {
          deadPlayer  : id,
          collide     : true,
          collidedWith: otherId
        };
      }
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

function lineIntersection(line1StartX, line1StartY, line1EndX, line1EndY, line2StartX, line2StartY, line2EndX, line2EndY) {
  //
  //const line1 = {
  //  startX: line1StartX,
  //  startY: line1StartY,
  //  endX  : line1EndX,
  //  endY  : line1EndY
  //};
  //const line2 = {
  //  startX: line2StartX,
  //  startY: line2StartY,
  //  endX  : line2EndX,
  //  endY  : line2EndY
  //};
  //console.log("var line1 = " + JSON.stringify(line1, null, 1));
  //console.log("var line2 = " + JSON.stringify(line2, null, 1));
  // if the lines intersect, the result contains the x and y of the intersection (treating the lines as infinite) and booleans for whether line segment 1 or line segment 2 contain the point
  let denominator, a, b, numerator1, numerator2, result = {
    x      : null,
    y      : null,
    onLine1: false,
    onLine2: false
  };
  denominator = ((line2EndY - line2StartY) * (line1EndX - line1StartX)) - ((line2EndX - line2StartX) * (line1EndY - line1StartY));
  if (denominator === 0) {
    return result;
  }
  a = line1StartY - line2StartY;
  b = line1StartX - line2StartX;
  numerator1 = ((line2EndX - line2StartX) * a) - ((line2EndY - line2StartY) * b);
  numerator2 = ((line1EndX - line1StartX) * a) - ((line1EndY - line1StartY) * b);
  a = numerator1 / denominator;
  b = numerator2 / denominator;

  // if we cast these lines infinitely in both directions, they intersect here:
  result.x = line1StartX + (a * (line1EndX - line1StartX));
  result.y = line1StartY + (a * (line1EndY - line1StartY));
  /*
          // it is worth noting that this should be the same as:
          x = line2StartX + (b * (line2EndX - line2StartX));
          y = line2StartX + (b * (line2EndY - line2StartY));
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

  console.log(position);
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

  const direction = Math.atan2(translatedCenter.y, translatedCenter.x);
  return direction;

  // return chance.integer({
  //   min: 0,
  //   max: Math.PI * 2
  // });
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
  R.forEachObjIndexed(function (player, id) {
    player.points = [];
    player.dead = false;
    player.color = getColor();
  }, players);
}

module.exports = function configureSocketIO(io) {
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
      const name = socket.handshake.query.name || chance.name();
      DEV && console.log(type, 'connected', id, name);

      // Attach events to socket
      socket.on('disconnect', clientDisconnected(socket));
      socket.on('changeDirection', clientChangedDirection(socket));

      // Add a new player to players object
      players[id] = {
        name  : name,
        color : getColor(),
        points: []
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
      DEV && console.log(socket.type, 'disconnected', id);

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
    DEV && console.log('Display disconnected');
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
    DEV && console.log('Display is initialized');
  }

  /**
   *
   */
  function displayStartedGame() {
    if (gameRunning) return;
    DEV && console.log('Display started game');
    gameRunning = true;
    resetGame();

    // Set initial position for every player
    R.forEachObjIndexed(function (player, id) {
      // Place player random on the map
      const position = randomPosition();
      const direction = randomDirection(position);

      DEV && console.log('Place player', id, position, direction);

      const point = {
        position,
        direction
      };

      player.direction = direction;
      player.points.push(point);
    }, players);

    DEV && console.log(players);
  }

  /**
   *
   */
  function displayStoppedGame() {
    if (!gameRunning) return;
    DEV && console.log('Display stopped game');
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
          DEV && console.log(key, 'outside screen');
          player.dead = true;
          player.points = [];
          if (displaySocket) displaySocket.emit('collision', {deadPlayer: key});
          return;
        }

        // Check for player collision
        const collision = checkPlayerCollision(key, lastPoint.position, newPoint.position);
        if (collision) {
          DEV && console.log(key, 'collision');
          player.dead = true;
          player.points = [];
          if (displaySocket) displaySocket.emit('collision', collision);
          return;
        }

        // Add newPoint in diff object for later client update
        diffs[key] = newPoint;

        // Add this newPoint to history
        player.points.push(newPoint);
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
};