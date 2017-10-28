const R = require('ramda');
const Chance = require('chance');

// constants
const WIDTH = 1280;
const HEIGHT = 768;
const PLAYER_SPEED = 40;
const DISPLAY = 'display';
const TICK_RATE = 500;
const STARTING_AREA_HORIZONTAL = 100;
const STARTING_AREA_VERTICAL = 100;
const CENTER = {
  x: WIDTH * 0.5,
  y: HEIGHT * 0.5
};
const COLORS = ['red', 'green', 'yellow', 'orange'];

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
let gameRunning = false;

//
let delta = 0;

//********************************************************************************
// HELPER
//********************************************************************************
/**
 * 
 */
function checkScreenBoundingBox(point) {
  const outsideHorizontal = point.x >= WIDTH || point.x <= 0;
  const outsideVertical = point.y >= HEIGHT || point.y <= 0;
  return outsideHorizontal || outsideVertical;
}

function checkPlayerCollision(id, lastPosition, newPosition) {
  const currentPlayerDirection = {
    x: newPosition.x - lastPosition.x,
    y: newPosition.y - lastPosition.y
  };

  for (const otherId in players) {
    if (otherId === id) continue;

    const player = players[otherId];
    if (player.points.length < 2) return;

    for (let i = player.points.length - 1; i >= 1; i--) {
      const checkNewPosition = player.points[i];
      const checkLastPosition = player.points[i - 1];
      const checkDirection = {
        x: checkNewPosition.x - checkLastPosition.x,
        y: checkNewPosition.y - checkLastPosition.y
      };

      if (lineIntersection(lastPosition, currentPlayerDirection, checkLastPosition, checkDirection)) {
        return {
          deadPlayer: id,
          collide: true,
          collidedWith: otherId
        };
      }
    }
  }

  return {
    collide: false
  };
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

/**
 * 
 */
function lineIntersection(P, r, Q, s) {
  // line1 = P + lambda1 * r
  // line2 = Q + lambda2 * s
  // r and s must be normalized (length = 1)
  // returns intersection point O of line1 with line2 = [ Ox, Oy ] 
  // returns null if lines do not intersect or are identical
  var PQx = Q.x - P.x;
  var PQy = Q.y - P.y;
  var rx = r.x;
  var ry = r.y;
  var rxt = -ry;
  var ryt = rx;
  var qx = PQx * rx + PQy * ry;
  var qy = PQx * rxt + PQy * ryt;
  var sx = s.x * rx + s.y * ry;
  var sy = s.x * rxt + s.y * ryt;
  // if lines are identical or do not cross...
  if (sy == 0) return false;
  const a = qx - qy * sx / sy;
  return {
    x: P.x + a * rx,
    y: P.y + a * ry
  };
}

/**
 * 
 */
function randomPosition() {
  const startLeft = chance.bool();
  const startTop = chance.bool();

  let x = 0;
  let y = 0;

  if (startLeft) {
    x = chance.integer({
      min: 5,
      max: STARTING_AREA_HORIZONTAL
    });
  } else {
    x = chance.integer({
      min: WIDTH - STARTING_AREA_HORIZONTAL,
      max: WIDTH - 5
    });
  }

  if (startTop) {
    y = chance.integer({
      min: 5,
      max: STARTING_AREA_VERTICAL
    });
  } else {
    y = chance.integer({
      min: HEIGHT - STARTING_AREA_VERTICAL,
      max: HEIGHT - 5
    });
  }

  return {
    x,
    y
  };
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
  }
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
      resetGame();

      displaySocket = socket;
      displaySocket.on('displayCreated', displayCreated);
      displaySocket.on('startGame', displayStartedGame);
      displaySocket.on('stopGame', displayStoppedGame);

      displaySocket.emit('playerList', players);
    } else {
      DEV && console.log(type, 'connected', id);

      // Attach events to socket
      socket.on('disconnect', clientDisconnected(socket));
      socket.on('changeDirection', clientChangedDirection(socket));

      // Add a new player to players object
      players[id] = {
        name: chance.name(),
        color: getColor(),
        points: []
      };

      if (gameRunning) {
        // Place player random on the map
        const position = randomPosition();
        const direction = randomDirection(position);

        players[id].direction = direction;

        players[id].points = [];
        players[id].points.push({
          position
        });
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

      // If display disconnects reset everything
      if (socket.type === 'display') {
        displaySocket = null;
        gameRunning = false;
        resetGame();
      }

      // Notify everyone about the player who left
      someoneLeft(id);
    }
  }

  /**
   * 
   */
  function clientChangedDirection(socket) {
    return function (rad) {
      const id = socket.id;
      const last = players[id].direction || 0;
      const newDirection = last + (rad * delta * 0.05);
      // DEV && console.log(last, rad, newDirection);

      players[id].direction = newDirection;
    }
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
          ...lastPoint,
          direction: player.direction
        };

        // Apply translation 
        newPoint.position.x = tx;
        newPoint.position.y = ty;

        // Check if new point is ouf screen bounds
        const pointOutsideScreen = checkScreenBoundingBox(newPoint.position);
        if (pointOutsideScreen) {
          DEV && console.log(key, 'outside screen');
          player.dead = true;
          player.points = [];
          return;
        }

        // Check for player collision
        const collision = checkPlayerCollision(key, lastPoint.position, newPoint.position);
        // if (collision.collide) {
        //   DEV && console.log(key, 'collide');
        //   player.dead = true;
        //   player.points = [];

        //   displaySocket.emit('collide', collision);
        //   return;
        // }

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

    lastTick = Date.now()
  }

  //********************************************************************************
  // EVENT MAPPING
  //********************************************************************************
  io.on('connection', clientConnected);
  const tickID = setInterval(tick, TICK_RATE);
}