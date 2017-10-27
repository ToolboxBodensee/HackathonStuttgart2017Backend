const express = require('express');
const path = require('path');

var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

//********************************************************************************
// EXPRESS MIDDLEWARE
//********************************************************************************
const publicPath = path.join(__dirname, 'node_modules', 'socket.io-client', 'dist');
app.use('/public', express.static(publicPath));
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

//********************************************************************************
// FROM CLIENT EVENTS
//********************************************************************************
function clientConnected(socket) {
  console.log('a user connected', socket.id);
  someoneJoined(socket);
}

function clientDisconnected(socket) {
  console.log('a user disconnected');
  someoneLeft();
}

function clientChangedDirection(socket) {
  console.log('a user changed his direction');
  someoneChangedDirection();
}

//********************************************************************************
// TO FRONTEND EVENTS
//********************************************************************************
function someoneJoined(socket) {
  io.emit('joined', {id: socket.id});
}

function someoneLeft() {
  io.emit('left');
}

function someoneChangedDirection() {
  io.emit('changedDirection');
}

function collisionOccured() {
  io.emit('collision');
}

function tick() {
  io.emit('tick');
}

//********************************************************************************
// TICK HANDLING
//********************************************************************************
const tickID = setInterval(tick, 1000);

//********************************************************************************
// EVENT MAPPING
//********************************************************************************
io.on('connection', clientConnected);
io.on('disconnect', clientDisconnected);
io.on('changeDirection', clientChangedDirection);

//********************************************************************************
// INIT SERVER
//********************************************************************************
const port = process.env.PORT || 3000;
http.listen(port, function () {
  console.log('listening on *:' + port);
});