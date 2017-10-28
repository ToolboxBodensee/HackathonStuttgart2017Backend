const express = require('express');
const path = require('path');

const logger = require('./log');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

//********************************************************************************
// EXPRESS MIDDLEWARE
//********************************************************************************
const publicPath = path.join(__dirname, 'node_modules');
app.use('/public', express.static(publicPath));
app.get('/bot', function (req, res) {
  res.sendFile(__dirname + '/bot.html');
});
app.get('/collision', function (req, res) {
  res.sendFile(__dirname + '/collisionTest.html');
});

//********************************************************************************
// CONFIGURE SOCKET IO
//********************************************************************************
const configureSocketIO = require('./socket');
configureSocketIO(io, app);

//********************************************************************************
// INIT SERVER
//********************************************************************************
const port = process.env.PORT || 3000;
http.listen(port, function () {
  console.log('listening on *:' + port);
});

process.on('uncaughtException', function (error) {
  logger.log('error', error);
  console.log('error');
});
