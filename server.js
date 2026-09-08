// Install express server
const express = require('express');
const path = require('path');
const http = require('http');

const app = express();

// One http.Server backs both the static Angular app and the Socket.IO
// realtime layer (formerly player_server.js on its own port/host).
// Socket.IO claims its own request path (`/socket.io/*`) at the http.Server
// level before Express's router ever sees them, so the two share a port
// without colliding.
const server = http.Server(app);
const { Server } = require('socket.io');
const io = new Server(server);

// In-memory store of quizzes currently being hosted.
// quizId -> { difficulty: number, users: string[] }
// This replaces the old DynamoDB-backed ActiveQuizzes table - there's no
// need for a separate persistent store just to track who's in a room while
// its host's socket is connected.
const quizzes = new Map();

function generateQuizId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let id;
  do {
    id = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (quizzes.has(id));
  return id;
}

function removeUserFromQuiz(quizId, username) {
  const quiz = quizzes.get(quizId);
  if (!quiz) {
    return null;
  }

  quiz.users = quiz.users.filter(u => u !== username);

  if (quiz.users.length === 0) {
    quizzes.delete(quizId);
    return null;
  }

  return quiz;
}

io.on('connection', socket => {
  socket.on('disconnect', function () {
    const quiz = removeUserFromQuiz(socket.quizId, socket.username);

    const emitData = {
      username: socket.username,
      quizId: socket.quizId,
      action: 'leave',
      partyList: quiz ? quiz.users : []
    };

    if (socket.quizId) {
      io.sockets.in(socket.quizId).emit('send', emitData);
    }

    socket.username = '';
    socket.quizId = '';
  });

  socket.on('send', function (data) {
    if (data.action === 'host') {
      const quizId = generateQuizId();
      quizzes.set(quizId, { difficulty: data.difficulty, users: [data.username] });

      socket.username = data.username;
      socket.quizId = quizId;
      socket.join(quizId);

      console.log(data.username + ' is hosting quiz ' + quizId + '.');

      socket.emit('send', {
        username: data.username,
        quizId: quizId,
        difficulty: data.difficulty,
        action: 'hosted',
        partyList: quizzes.get(quizId).users
      });
    }
    else if (data.action === 'join') {
      const quiz = quizzes.get(data.quizId);

      if (!quiz) {
        socket.emit('send', { action: 'error', message: 'Quiz ' + data.quizId + ' was not found.' });
        return;
      }
      if (quiz.users.includes(data.username)) {
        socket.emit('send', { action: 'error', message: 'That username is already taken in this quiz.' });
        return;
      }
      if (quiz.users.length >= 4) {
        socket.emit('send', { action: 'error', message: 'This quiz is full.' });
        return;
      }

      quiz.users.push(data.username);

      socket.username = data.username;
      socket.quizId = data.quizId;
      socket.join(data.quizId);

      const emitData = {
        username: data.username,
        quizId: data.quizId,
        action: 'join',
        partyList: quiz.users
      };

      console.log(socket.username + ' has joined quiz ' + socket.quizId + '.');
      console.log(socket.quizId + ' contains: ' + quiz.users);

      io.sockets.in(data.quizId).emit('send', emitData);
    }
    else if (data.action === 'leave') {
      const quiz = removeUserFromQuiz(socket.quizId, data.username);

      console.log(socket.username + ' has left quiz ' + socket.quizId + '.');

      socket.leave(socket.quizId);

      const emitData = {
        username: socket.username,
        quizId: socket.quizId,
        action: 'leave',
        partyList: quiz ? quiz.users : []
      };

      io.sockets.in(socket.quizId).emit('send', emitData);

      socket.username = '';
      socket.quizId = '';
    }
    else if (data.action === 'start') {
      io.sockets.in(socket.quizId).emit('send', { action: 'start' });
    }
    else {
      console.log('Unspecified action');
    }
  });
});

// Serve the built Angular app.
app.use(express.static(__dirname + '/dist'));

app.get('/isAlive', (req, res) => {
  res.send('Alive!');
});

app.get('/*', function (req, res) {
  res.sendFile(path.join(__dirname + '/dist/index.html'));
});

// Start the app by listening on the default Heroku port
server.listen(process.env.PORT || 8080, () => {
  console.log('quizmaster listening on port ' + (process.env.PORT || 8080));
});
