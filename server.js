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

// Fetches one shared set of questions for a quiz - called once per quiz,
// not once per player, so every player gets the same questions in the
// same order. `encode=url3986` asks Open Trivia DB for percent-encoded
// text instead of HTML entities, which Node can decode with the built-in
// decodeURIComponent (no DOM/entity table needed server-side).
async function fetchQuizQuestions(amount) {
  const url = 'https://opentdb.com/api.php?amount=' + amount + '&encode=url3986';
  const response = await fetch(url);
  const body = await response.json();

  if (body.response_code !== 0) {
    throw new Error('Open Trivia DB could not return questions for this request (response_code ' + body.response_code + ').');
  }

  return body.results.map(result => ({
    category: decodeURIComponent(result.category),
    type: result.type,
    difficulty: result.difficulty,
    question: decodeURIComponent(result.question),
    correctAnswer: decodeURIComponent(result.correct_answer),
    incorrectAnswers: result.incorrect_answers.map(answer => decodeURIComponent(answer))
  }));
}

// A refresh disconnects the old socket (dropping it to 0 users, if it was
// the only one) an instant before the new socket reconnects and claims the
// quiz again. Deleting the quiz the moment it hits 0 users would race that
// reconnect and delete it out from under a solo player who just refreshed -
// so give it a few seconds to see if anyone comes back before actually
// tearing it down.
const QUIZ_CLEANUP_GRACE_MS = 5000;

function cancelQuizCleanup(quiz) {
  if (quiz.cleanupHandle) {
    clearTimeout(quiz.cleanupHandle);
    quiz.cleanupHandle = null;
  }
}

function scheduleQuizCleanup(quizId) {
  const quiz = quizzes.get(quizId);
  if (!quiz) {
    return;
  }

  cancelQuizCleanup(quiz);
  quiz.cleanupHandle = setTimeout(() => {
    const current = quizzes.get(quizId);
    if (current && current.users.length === 0) {
      quizzes.delete(quizId);
    }
  }, QUIZ_CLEANUP_GRACE_MS);
}

function removeUserFromQuiz(quizId, username) {
  const quiz = quizzes.get(quizId);
  if (!quiz) {
    return null;
  }

  quiz.users = quiz.users.filter(u => u !== username);

  if (quiz.users.length === 0) {
    scheduleQuizCleanup(quizId);
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

  socket.on('send', async function (data) {
    if (data.action === 'host') {
      const quizId = generateQuizId();
      quizzes.set(quizId, { difficulty: data.difficulty, users: [data.username], questions: null, scores: {}, startedAt: null });

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
      if (quiz.users.length >= 8) {
        socket.emit('send', { action: 'error', message: 'This quiz is full.' });
        return;
      }

      quiz.users.push(data.username);
      cancelQuizCleanup(quiz);

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
      const quiz = quizzes.get(socket.quizId);

      if (!quiz) {
        socket.emit('send', { action: 'error', message: 'This quiz no longer exists.' });
        return;
      }

      try {
        if (!quiz.questions) {
          quiz.questions = await fetchQuizQuestions(50);
          // The moment the clock actually starts for this quiz - not
          // when any individual player's page happens to load. Lets a
          // player who navigates away (or refreshes) mid-quiz and comes
          // back see the real remaining time instead of a fresh 30s.
          //
          // Offset 3s into the future to match the 3-2-1 countdown every
          // client runs (see beginCountdown() in dashboard.component.ts)
          // before it navigates to the quiz page - without this, that
          // countdown itself ate into the 30s clock, so players actually
          // saw it start at 27.
          quiz.startedAt = Date.now() + 3000;
        }
        io.sockets.in(socket.quizId).emit('send', { action: 'start', quizId: socket.quizId, questions: quiz.questions });
      } catch (err) {
        console.error('Failed to fetch quiz questions: ' + err);
        socket.emit('send', { action: 'error', message: 'Could not load quiz questions. Please try again.', retryable: true });
      }
    }
    else if (data.action === 'getQuestions') {
      // Used when the quiz page loads - including on a refresh, where all
      // client-side state (and the previous socket connection) is gone.
      // Serves the same cached question set generated on 'start' rather
      // than fetching a fresh, differently-ordered set per request.
      const quiz = quizzes.get(data.quizId);

      if (!quiz) {
        socket.emit('send', { action: 'error', message: 'This quiz no longer exists.' });
        return;
      }
      if (!quiz.questions) {
        socket.emit('send', { action: 'error', message: 'This quiz has not started yet.', retryable: true });
        return;
      }

      // A refresh disconnects the old socket first, which removes this
      // player from quiz.users (see the 'disconnect' handler above) and
      // drops it out of the "quizId" room, so it stops receiving 'scores'
      // broadcasts. Re-establish both here, on whichever socket - new or
      // original - ends up asking for this quiz's questions, so a
      // refreshed player still shows up on the party/score list and still
      // gets live score updates from everyone else.
      if (data.username) {
        // If this player already has another live tab/window on this same
        // quiz (a genuine second tab, not just a refresh - a refresh's old
        // socket is usually already gone by now), kick it. Otherwise both
        // tabs run their own independent 30s answer clock off the same
        // question set - effectively a second attempt at every question -
        // and both call submitScore at the end, with whichever happens to
        // land last silently overwriting the other's real score. Only the
        // newest tab should ever be "live" for a given player.
        const room = io.sockets.adapter.rooms.get(data.quizId);
        if (room) {
          for (const socketId of room) {
            if (socketId === socket.id) {
              continue;
            }
            const other = io.sockets.sockets.get(socketId);
            if (other && other.username === data.username) {
              other.emit('send', { action: 'kicked', quizId: data.quizId, message: 'This quiz was opened in another tab or window.' });
              other.disconnect(true);
            }
          }
        }

        socket.username = data.username;
        socket.quizId = data.quizId;
        socket.join(data.quizId);

        if (!quiz.users.includes(data.username)) {
          quiz.users.push(data.username);
        }
        // Someone just proved they're still here - whether they were
        // already in quiz.users or just got re-added above, cancel any
        // pending cleanup from a prior disconnect (e.g. the refresh that
        // likely preceded this very request).
        cancelQuizCleanup(quiz);
      }

      socket.emit('send', { action: 'questions', quizId: data.quizId, questions: quiz.questions, partyList: quiz.users, scores: quiz.scores, startedAt: quiz.startedAt });
    }
    else if (data.action === 'submitScore') {
      const quiz = quizzes.get(data.quizId);

      if (!quiz) {
        return;
      }

      quiz.scores[data.username] = data.score;

      io.sockets.in(data.quizId).emit('send', { action: 'scores', quizId: data.quizId, scores: quiz.scores });
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
