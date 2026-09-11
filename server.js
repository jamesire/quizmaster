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

// A rotating pool of pre-fetched 50-question batches, topped up steadily
// in the background instead of fetching live at the exact moment someone
// clicks Start. Open Trivia DB only allows ~1 request per 5s per IP,
// shared across every quiz on this whole app - fetching on demand means
// a burst of simultaneous hosts (a Reddit-post spike, say) all race the
// same 5-second window and most of them lose (measured: a 10-quiz burst
// saw 40% need a manual retry, a 20-quiz burst saw 65%).
//
// Quiz-starts *read* from this pool rather than draining it - different
// quiz rooms never see or interact with each other, and it's fine for
// two unrelated rooms to occasionally get the same batch (the pool
// rotates every 6s anyway) - so there's no "ran dry" failure mode at
// all: any quiz-start succeeds instantly as long as the pool has had at
// least one batch since boot, which takes well under a second.
const questionPool = [];
const QUESTION_POOL_TARGET_DEPTH = 20;
// Comfortably above OpenTDB's 5s limit, not butted right up against it.
const QUESTION_POOL_REFILL_INTERVAL_MS = 6000;

async function refillQuestionPool() {
  try {
    questionPool.push(await fetchQuizQuestions(50));
    // Evict the oldest once over depth, rather than just stopping once
    // "full" - keeps the pool perpetually rotating/fresh, since nothing
    // else drains it anymore.
    if (questionPool.length > QUESTION_POOL_TARGET_DEPTH) {
      questionPool.shift();
    }
  } catch (err) {
    // Rate-limited or a transient network issue - just try again on the
    // next tick rather than treating this as fatal. Whatever's currently
    // in the pool (even if that's nothing) is still an improvement over
    // always fetching live.
    console.error('Question pool refill failed: ' + err);
  }
}

setInterval(refillQuestionPool, QUESTION_POOL_REFILL_INTERVAL_MS);
refillQuestionPool(); // Start warming the pool immediately on boot, not 6s from now.

// The single place a quiz (new or replayed) gets its question set from -
// a random already-fetched batch from the pool (effectively instant, no
// network call in the request path, and never removed - other quizzes
// can draw the same batch) if the pool has anything, or a live fetch as
// a fallback in the near-impossible case it's still empty (i.e. before
// the very first fetch completes after a fresh boot).
async function getQuestionsForQuiz() {
  if (questionPool.length > 0) {
    return questionPool[Math.floor(Math.random() * questionPool.length)];
  }
  return fetchQuizQuestions(50);
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

// GAME_DURATION_MS must match secondsForGame in start-quiz.component.ts -
// it's what the server's own authoritative end-of-game timer is anchored
// against, separately from (but consistently with) each client's local
// countdown display.
const GAME_DURATION_MS = 30000;
// A client's own 30s timer and the server's are anchored to the same
// startedAt, but a client's final submitScore still has to cross the
// network after its timer fires - this buffer gives those in-flight
// submissions a moment to land before winners are computed. (submitScore
// also resolves early, below, once every current player is actually in -
// this buffer is just the worst-case fallback.)
const GAME_END_GRACE_MS = 2000;
// How long players get to opt into a rematch after a game ends.
const REPLAY_VOTE_WINDOW_MS = 15000;

function scheduleGameEnd(quizId) {
  const quiz = quizzes.get(quizId);
  if (!quiz || !quiz.startedAt) {
    return;
  }

  if (quiz.gameEndHandle) {
    clearTimeout(quiz.gameEndHandle);
  }
  quiz.gameOver = false;
  const delay = Math.max(quiz.startedAt + GAME_DURATION_MS + GAME_END_GRACE_MS - Date.now(), 0);
  quiz.gameEndHandle = setTimeout(() => endGame(quizId), delay);
}

// Pure function (no Map/Set/socket lookups) so it's easy to sanity-check
// in isolation. Ties for the top score all count as a win; a game where
// nobody scored above 0 doesn't hand out a phantom win to everyone.
function computeWinners(scores) {
  const entries = Object.entries(scores);
  if (!entries.length) {
    return [];
  }

  const maxScore = Math.max(...entries.map(([, s]) => s));
  if (maxScore <= 0) {
    return [];
  }

  return entries.filter(([, s]) => s === maxScore).map(([u]) => u);
}

// The authoritative "this game just ended" transition - computes and
// credits the winner(s) into the running session tally, then opens the
// 15s replay-vote window. Runs once per game regardless of which path
// triggers it (the scheduled timer, or submitScore's early-resolve
// check), guarded by quiz.gameOver.
function endGame(quizId) {
  const quiz = quizzes.get(quizId);
  if (!quiz || quiz.gameOver) {
    return;
  }

  quiz.gameOver = true;
  if (quiz.gameEndHandle) {
    clearTimeout(quiz.gameEndHandle);
    quiz.gameEndHandle = null;
  }

  computeWinners(quiz.scores).forEach(u => {
    quiz.sessionWins[u] = (quiz.sessionWins[u] || 0) + 1;
  });

  quiz.replayVotes = new Set();
  quiz.replayResolved = false;
  quiz.replayed = false;
  quiz.replayDeadline = Date.now() + REPLAY_VOTE_WINDOW_MS;

  io.sockets.in(quizId).emit('send', {
    action: 'gameOver',
    quizId,
    scores: quiz.scores,
    sessionWins: quiz.sessionWins,
    replayDeadline: quiz.replayDeadline
  });

  quiz.replayHandle = setTimeout(() => resolveReplayVote(quizId), REPLAY_VOTE_WINDOW_MS);
}

// Resolves the replay-vote window - called either when the 15s timer
// fires, or as soon as every current player has voted. Idempotent via
// replayResolved, so whichever path loses that race is a no-op.
function resolveReplayVote(quizId) {
  const quiz = quizzes.get(quizId);
  if (!quiz || quiz.replayResolved) {
    return;
  }

  quiz.replayResolved = true;
  if (quiz.replayHandle) {
    clearTimeout(quiz.replayHandle);
    quiz.replayHandle = null;
  }

  const voters = Array.from(quiz.replayVotes).filter(u => quiz.users.includes(u));

  if (voters.length < 2) {
    quiz.replayed = false;
    io.sockets.in(quizId).emit('send', { action: 'replayWindowClosed', quizId, replayed: false });
    return;
  }

  quiz.replayed = true;
  io.sockets.in(quizId).emit('send', { action: 'replayWindowClosed', quizId, replayed: true });
  // startReplayGame is async but deliberately not awaited here (nothing
  // in this synchronous handler needs to wait on it) - catch is there so
  // an unexpected failure inside it logs instead of becoming an unhandled
  // promise rejection.
  startReplayGame(quizId, voters).catch(err => console.error('startReplayGame failed for ' + quizId + ': ' + err));
}

// Spins up a fresh quiz for exactly the players who voted to replay -
// no lobby, no host, no 3-2-1 countdown, straight into question 1 -
// carrying the running session win tally forward. Non-voters are left
// untouched in the old quiz, which the existing scheduleQuizCleanup
// grace-deletes once it's actually empty.
async function startReplayGame(oldQuizId, voters) {
  const oldQuiz = quizzes.get(oldQuizId);
  if (!oldQuiz) {
    return;
  }

  const newQuizId = generateQuizId();
  const newQuiz = {
    difficulty: oldQuiz.difficulty,
    users: [...voters],
    questions: null,
    scores: {},
    startedAt: null,
    cleanupHandle: null,
    gameEndHandle: null,
    gameOver: false,
    sessionWins: { ...oldQuiz.sessionWins },
    replayVotes: new Set(),
    replayDeadline: null,
    replayHandle: null,
    replayResolved: false,
    replayed: false
  };
  quizzes.set(newQuizId, newQuiz);

  // getQuestionsForQuiz() draws from the shared buffer first (almost
  // always ready, effectively instant), only falling back to a live
  // fetch if the buffer's genuinely empty. There's still no user-facing
  // retry for a replay specifically (it's fully automatic once votes
  // resolve), so keep a retry loop as a safety net for that fallback
  // case - each retry re-checks the buffer too, which may well have
  // refilled by then, not just re-attempting the same live fetch.
  const REPLAY_FETCH_RETRIES = 3;
  const REPLAY_FETCH_RETRY_DELAY_MS = 5000;
  let lastErr;
  for (let attempt = 0; attempt <= REPLAY_FETCH_RETRIES; attempt++) {
    try {
      newQuiz.questions = await getQuestionsForQuiz();
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < REPLAY_FETCH_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, REPLAY_FETCH_RETRY_DELAY_MS));
      }
    }
  }
  if (lastErr) {
    console.error('Failed to fetch questions for replay quiz ' + newQuizId + ' after ' + (REPLAY_FETCH_RETRIES + 1) + ' attempts: ' + lastErr);
    quizzes.delete(newQuizId);
    io.sockets.in(oldQuizId).emit('send', {
      action: 'replayFailed',
      quizId: oldQuizId,
      message: 'Could not start the replay. Please return to the dashboard and start a new quiz.'
    });
    return;
  }
  // No +3000 countdown buffer here (unlike the normal 'start' handler) -
  // a replay drops voters straight into question 1, there's no 3-2-1
  // beat to account for.
  newQuiz.startedAt = Date.now();
  scheduleGameEnd(newQuizId);

  // Move each voter's live connection out of the old room and into the
  // new one before announcing it, so the room is authoritative the
  // moment clients hear about it.
  const oldRoom = io.sockets.adapter.rooms.get(oldQuizId);
  if (oldRoom) {
    for (const socketId of Array.from(oldRoom)) {
      const s = io.sockets.sockets.get(socketId);
      if (s && voters.includes(s.username)) {
        s.leave(oldQuizId);
        s.join(newQuizId);
        s.quizId = newQuizId;
      }
    }
  }

  oldQuiz.users = oldQuiz.users.filter(u => !voters.includes(u));
  if (oldQuiz.users.length === 0) {
    scheduleQuizCleanup(oldQuizId);
  }

  io.sockets.in(newQuizId).emit('send', { action: 'replayStart', quizId: newQuizId });
}

io.on('connection', socket => {
  socket.on('disconnect', function () {
    const quiz = removeUserFromQuiz(socket.quizId, socket.username);

    // A player leaving mid-replay-vote-window shouldn't strand everyone
    // else waiting on a vote (or a "not voted yet" slot) that's never
    // coming - drop their vote and re-check whether that's now everyone.
    if (quiz && quiz.gameOver && !quiz.replayResolved) {
      if (quiz.replayVotes.delete(socket.username)) {
        io.sockets.in(socket.quizId).emit('send', { action: 'replayVotes', quizId: socket.quizId, votes: Array.from(quiz.replayVotes) });
      }
      if (quiz.replayVotes.size >= quiz.users.length) {
        resolveReplayVote(socket.quizId);
      }
    }

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
      quizzes.set(quizId, {
        difficulty: data.difficulty,
        users: [data.username],
        questions: null,
        scores: {},
        startedAt: null,
        cleanupHandle: null,
        gameEndHandle: null,
        gameOver: false,
        sessionWins: {},
        replayVotes: new Set(),
        replayDeadline: null,
        replayHandle: null,
        replayResolved: false,
        replayed: false
      });

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
          quiz.questions = await getQuestionsForQuiz();
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
          scheduleGameEnd(socket.quizId);
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

      socket.emit('send', {
        action: 'questions',
        quizId: data.quizId,
        questions: quiz.questions,
        partyList: quiz.users,
        scores: quiz.scores,
        startedAt: quiz.startedAt,
        sessionWins: quiz.sessionWins,
        gameOver: quiz.gameOver,
        replayDeadline: quiz.gameOver ? quiz.replayDeadline : null,
        replayVotes: quiz.gameOver ? Array.from(quiz.replayVotes) : []
      });
    }
    else if (data.action === 'submitScore') {
      const quiz = quizzes.get(data.quizId);

      if (!quiz) {
        return;
      }

      quiz.scores[data.username] = data.score;

      io.sockets.in(data.quizId).emit('send', { action: 'scores', quizId: data.quizId, scores: quiz.scores });

      // Nothing left to wait for once every currently-connected player
      // actually has a score in and the nominal 30s has elapsed - resolve
      // right away instead of sitting out the rest of GAME_END_GRACE_MS.
      if (!quiz.gameOver && quiz.startedAt && Date.now() >= quiz.startedAt + GAME_DURATION_MS
        && quiz.users.every(u => quiz.scores[u] !== undefined)) {
        endGame(data.quizId);
      }
    }
    else if (data.action === 'replayVote') {
      const quiz = quizzes.get(data.quizId);

      if (!quiz || !quiz.gameOver) {
        return;
      }

      if (quiz.replayResolved) {
        // Arrived after the window already closed elsewhere - tell just
        // this socket so its UI doesn't hang on a vote that'll never
        // do anything.
        socket.emit('send', { action: 'replayWindowClosed', quizId: data.quizId, replayed: quiz.replayed });
        return;
      }
      if (!quiz.users.includes(data.username)) {
        return;
      }

      quiz.replayVotes.add(data.username);
      io.sockets.in(data.quizId).emit('send', { action: 'replayVotes', quizId: data.quizId, votes: Array.from(quiz.replayVotes) });

      if (quiz.replayVotes.size >= quiz.users.length) {
        resolveReplayVote(data.quizId);
      }
    }
    else {
      console.log('Unspecified action');
    }
  });
});

// Serve the built Angular app.
//
// Every build gives its JS/CSS bundles a content hash in the filename
// (main.<hash>.js, styles.<hash>.css, plus lazy chunks like
// 57.<hash>.js) - a new deploy always produces new filenames, and the
// old ones are simply gone once dist/ is replaced. index.html is the
// one file that ties a specific set of those hashes together, so if a
// browser ever caches an old index.html past a deploy, it goes on
// requesting bundle files that no longer exist - they 404, Angular
// never bootstraps, and the visitor gets a blank white page until they
// hard-reload. Explicitly forcing index.html to always revalidate
// closes that gap; the hashed bundles themselves are safe to cache
// essentially forever, since any content change already means a new
// filename.
const HASHED_ASSET_PATTERN = /\.[0-9a-f]{8,}\.(js|css)$/i;

app.use(express.static(__dirname + '/dist', {
  setHeaders: (res, filePath) => {
    if (path.basename(filePath) === 'index.html') {
      res.setHeader('Cache-Control', 'no-store');
    } else if (HASHED_ASSET_PATTERN.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      // favicon.ico, ads.txt, src/assets/* etc. - none of these have a
      // content hash in their name, so a long/immutable cache would
      // mean a real update to one of them could stay stale in
      // visitors' browsers indefinitely. A moderate cache still saves
      // most of the benefit without that risk.
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

app.get('/isAlive', (req, res) => {
  res.send('Alive!');
});

app.get('/*', function (req, res) {
  // Same reasoning as the index.html case above - every client-side
  // (Angular) route falls through to here.
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname + '/dist/index.html'));
});

// Periodic resource snapshot - lands in the same log stream as everything
// else (WP Engine's log viewer, or any other host's), so actual memory/
// connection trends can be read straight off the existing logs during
// normal use, a deploy, or a stress test, without needing a separate
// dashboard or metrics endpoint. 15s is short enough to catch a burst
// that resolves in under a minute (the local stress test's whole burst
// took ~18s), without being noisy at rest.
const RESOURCE_LOG_INTERVAL_MS = 15000;

setInterval(() => {
  const mem = process.memoryUsage();
  const toMB = bytes => Math.round(bytes / 1024 / 1024);

  console.log(
    'Resource snapshot - ' +
    'RSS: ' + toMB(mem.rss) + 'MB, ' +
    'heapUsed: ' + toMB(mem.heapUsed) + 'MB, ' +
    'heapTotal: ' + toMB(mem.heapTotal) + 'MB | ' +
    'active quizzes: ' + quizzes.size + ', ' +
    'active connections: ' + io.engine.clientsCount + ', ' +
    'question pool: ' + questionPool.length + '/' + QUESTION_POOL_TARGET_DEPTH
  );
}, RESOURCE_LOG_INTERVAL_MS);

// Start the app by listening on the default Heroku port
server.listen(process.env.PORT || 8080, () => {
  console.log('quizmaster listening on port ' + (process.env.PORT || 8080));
});
