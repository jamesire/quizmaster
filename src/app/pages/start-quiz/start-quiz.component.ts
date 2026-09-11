import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PartyMemberService } from 'src/app/party-member/party-member.service';
import { Question } from 'src/app/models/Question';
import { QuestionHelper } from 'src/app/models/QuestionHelper';
import { ClipboardHelper } from 'src/app/models/ClipboardHelper';
import { QuizLinkToken } from 'src/app/models/QuizLinkToken';

@Component({
    selector: 'app-start-quiz',
    templateUrl: './start-quiz.component.html',
    styleUrls: ['./start-quiz.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})

export class StartQuizComponent implements OnInit, OnDestroy {
  // One 30-second clock for the whole quiz, not per question - matches
  // the "quick-fire quiz... time limit is 30 seconds" pitch on the
  // hosting modal (whole-session limit, just at 30s per the user's
  // request instead of the originally-advertised 60). Players answer
  // as many questions as they can, at their own pace, before it expires.
  public readonly secondsForGame: number = 30;
  public secondsRemaining: number = this.secondsForGame;
  public  questionIndex: number = 0;
  public readonly makeOpaque: string = "change-opacity-on-answer";
  public isLoaded: boolean = false;
  public isFinished: boolean = false;
  public answerIsSelected: boolean = false;
  public quizQuestions: Question[];
  public css: string[] = [];
  public score: number = 0;
  public partyList: string[] = [];
  public scores: { [username: string]: number } = {};
  public username: string;
  public loadError: string = null;
  public loadErrorRetryable: boolean = false;
  public answerHistory: boolean[] = [];
  public resultsCopied: boolean = false;
  public scoreStarFlip: boolean = false;
  public kicked: boolean = false;
  public sessionWins: { [username: string]: number } = {};
  public replayWindowOpen: boolean = false;
  public replayClosed: boolean = false;
  public replayed: boolean = false;
  public replayVotesList: string[] = [];
  public hasVotedReplay: boolean = false;
  public replaySecondsRemaining: number = 0;
  public replayError: string = null;
  private quizId: string;
  private timerHandle: any;
  private subscription: Subscription;
  private paramSub: Subscription;
  private retryHandle: any;
  private retryAttempts: number = 0;
  private readonly maxAutoRetries: number = 3;
  private scoreStarFlipHandle: any;
  private replayTimerHandle: any;

  constructor(private route: ActivatedRoute, private router: Router, private partyMemberService: PartyMemberService) { }

  ngOnInit() {
    // The server generates one shared question set per quiz (on "start")
    // and hands it out on request - this is what keeps every player (and
    // a player who refreshes mid-quiz) seeing the same questions in the
    // same order, instead of each browser fetching its own random set.
    //
    // partyMembers is a single app-wide Subject that outlives this
    // component, so this subscription has to be torn down explicitly in
    // ngOnDestroy - otherwise every quiz played in a session leaves
    // another subscriber behind permanently. Set up exactly once here,
    // not per-quiz in loadQuiz() below - re-subscribing on every replay
    // would stack up duplicate listeners on the same shared Subject.
    this.subscription = this.partyMemberService.partyMembers.subscribe(msg => {
      if (msg.action === 'questions' && msg.quizId === this.quizId) {
        this.quizQuestions = QuestionHelper.setAnswerChoices(msg.questions);
        this.partyList = msg.partyList;
        this.scores = msg.scores;
        this.isLoaded = true;
        this.loadError = null;
        this.retryAttempts = 0;
        this.startGameTimer(msg.startedAt);

        this.sessionWins = msg.sessionWins || {};
        if (msg.gameOver) {
          // Landed here (e.g. via a refresh) while the previous game's
          // replay-vote window is still open - rehydrate straight into
          // that UI instead of a dead "Time's up" screen with no way to
          // know a rematch is up for grabs.
          this.replayWindowOpen = true;
          this.replayVotesList = msg.replayVotes || [];
          this.hasVotedReplay = this.replayVotesList.includes(this.username);
          this.startReplayCountdown(msg.replayDeadline);
        }
      }
      else if (msg.action === 'scores' && msg.quizId === this.quizId) {
        this.scores = msg.scores;
      }
      else if (msg.action === 'kicked' && msg.quizId === this.quizId) {
        // The server saw this same player open another tab/window on this
        // quiz and is keeping that one live instead - stop this instance
        // dead so it can't keep answering (or submit a stale score that'd
        // overwrite the real one) in the background.
        this.kicked = true;
        this.clearTimer();
      }
      else if (msg.action === 'gameOver' && msg.quizId === this.quizId) {
        this.sessionWins = msg.sessionWins;
        this.replayWindowOpen = true;
        this.replayClosed = false;
        this.startReplayCountdown(msg.replayDeadline);
      }
      else if (msg.action === 'replayVotes' && msg.quizId === this.quizId) {
        this.replayVotesList = msg.votes;
        this.hasVotedReplay = msg.votes.includes(this.username);
      }
      else if (msg.action === 'replayWindowClosed' && msg.quizId === this.quizId) {
        this.replayWindowOpen = false;
        this.replayClosed = true;
        this.replayed = msg.replayed;
        this.clearReplayTimer();
      }
      else if (msg.action === 'replayStart') {
        // Unlike every other handler here, msg.quizId is deliberately the
        // NEW quiz's id, not this.quizId (the one just finished) - so it
        // can never match a "=== this.quizId" filter. No filter is needed
        // anyway: the server only emits this into the new quiz's room,
        // which by construction only this player's just-migrated socket
        // (and fellow voters') belongs to.
        //
        // The actual state reset happens in loadQuiz(), triggered by the
        // paramMap change this navigation causes below - not here, so
        // there's exactly one reset code path regardless of how a quiz
        // page gets (re)loaded.
        const newToken = QuizLinkToken.encode(msg.quizId, this.username);
        this.router.navigate(['/play', newToken], { replaceUrl: true });
      }
      else if (msg.action === 'replayFailed' && msg.quizId === this.quizId) {
        this.replayError = msg.message;
      }
      else if (msg.action === 'error') {
        console.error('Start quiz message: ' + msg.message);
        this.loadError = msg.message;
        this.loadErrorRetryable = !!msg.retryable;

        if (msg.retryable && this.retryAttempts < this.maxAutoRetries) {
          this.retryAttempts++;
          // 5s matches Open Trivia DB's own rate-limit window, and gives
          // a host who's mid-click on "Start Quiz" time to finish.
          this.retryHandle = setTimeout(() => this.retryLoad(), 5000);
        }
      }
    });

    // Angular reuses this same component instance across navigations
    // between two routes that match the same path (e.g. /play/:oldToken
    // -> /play/:newToken after a replay) rather than destroying and
    // recreating it - so a one-shot route.snapshot read here would only
    // ever see the very first quiz. Subscribing to paramMap instead means
    // every subsequent replay navigation re-runs loadQuiz() too, and it
    // fires immediately with the current value on this first subscribe,
    // same as a snapshot read would have.
    this.paramSub = this.route.paramMap.subscribe(params => {
      this.loadQuiz(params.get('token'));
    });
  }

  // Loads (or reloads, after a replay) the quiz named by the given
  // /play/:token - resets every piece of per-game state first, so a
  // replay's fresh questionIndex/score/leaderboard/etc. don't inherit
  // anything left over from the game that just finished.
  private loadQuiz(token: string) {
    this.clearTimer();
    this.clearReplayTimer();
    if (this.retryHandle) {
      clearTimeout(this.retryHandle);
      this.retryHandle = null;
    }
    if (this.scoreStarFlipHandle) {
      clearTimeout(this.scoreStarFlipHandle);
      this.scoreStarFlipHandle = null;
    }

    this.questionIndex = 0;
    this.isLoaded = false;
    this.isFinished = false;
    this.answerIsSelected = false;
    this.quizQuestions = undefined;
    this.css = [];
    this.score = 0;
    this.partyList = [];
    this.scores = {};
    this.loadError = null;
    this.loadErrorRetryable = false;
    this.answerHistory = [];
    this.resultsCopied = false;
    this.scoreStarFlip = false;
    this.kicked = false;
    this.retryAttempts = 0;
    this.sessionWins = {};
    this.replayWindowOpen = false;
    this.replayClosed = false;
    this.replayed = false;
    this.replayVotesList = [];
    this.hasVotedReplay = false;
    this.replaySecondsRemaining = 0;
    this.replayError = null;

    const decoded = token ? QuizLinkToken.decode(token) : null;

    if (!decoded) {
      // A malformed/hand-edited link, not a transient failure - nothing a
      // retry would fix.
      this.loadError = 'This quiz link looks invalid.';
      this.loadErrorRetryable = false;
      return;
    }

    this.quizId = decoded.quizId;
    this.username = decoded.username;

    this.partyMemberService.getQuestions(this.quizId, this.username);
  }

  ngOnDestroy() {
    this.clearTimer();
    this.clearReplayTimer();
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.paramSub) {
      this.paramSub.unsubscribe();
    }
    if (this.retryHandle) {
      clearTimeout(this.retryHandle);
      this.retryHandle = null;
    }
    if (this.scoreStarFlipHandle) {
      clearTimeout(this.scoreStarFlipHandle);
      this.scoreStarFlipHandle = null;
    }
  }

  retryLoad() {
    this.loadError = null;
    this.partyMemberService.getQuestions(this.quizId, this.username);
  }

  checkAnswer(i: number) {
    if (this.answerIsSelected || this.isFinished || this.kicked) {
      return;
    }

    this.answerIsSelected = true;

    // Highlight every answer for the question just answered right away.
    this.quizQuestions[this.questionIndex].allAnswers.forEach((answer, index) => {
      this.css[index] = answer.isCorrect ? "correct-answer" : "incorrect-answer";
    });

    const isCorrect = this.quizQuestions[this.questionIndex].allAnswers[i].isCorrect;
    this.answerHistory.push(isCorrect);

    if (isCorrect) {
      this.score++;
      this.triggerScoreStarFlip();
    }

    setTimeout(() => {
      if (this.isFinished) {
        return;
      }

      this.answerIsSelected = false;
      this.css = [];

      // 30s can't realistically reach the end of a 50-question set (that's
      // ~12 questions even answering instantly with no reading time), but
      // guard it anyway rather than let it run off the end of the array.
      if (this.questionIndex + 1 < this.quizQuestions.length) {
        this.questionIndex++;
      }
    }, 2500);
  }

  // Re-triggers the score badge's star-flip CSS animation on every
  // correct answer, including back-to-back ones. Just setting the flag
  // true again wouldn't restart the animation if it's already true, so
  // it's cleared first and re-set on the next tick, giving Angular a
  // chance to actually remove the class before it's added back.
  private triggerScoreStarFlip() {
    if (this.scoreStarFlipHandle) {
      clearTimeout(this.scoreStarFlipHandle);
    }
    this.scoreStarFlip = false;
    setTimeout(() => {
      this.scoreStarFlip = true;
      this.scoreStarFlipHandle = setTimeout(() => this.scoreStarFlip = false, 500);
    });
  }

  // Bases the countdown on the quiz's actual start time (from the
  // server) rather than always resetting to a fresh secondsForGame -
  // otherwise navigating away and back (or refreshing) would silently
  // extend a player's playing time by however long they were away.
  private startGameTimer(startedAt: number) {
    this.clearTimer();

    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    this.secondsRemaining = this.secondsForGame - elapsedSeconds;

    if (this.secondsRemaining <= 0) {
      // Time was already up before this page even finished loading -
      // e.g. re-entering well after navigating away mid-quiz. Just show
      // whatever's already on the scoreboard; don't submit a score for
      // this instance (score would be 0, since it never actually played
      // this session, and would overwrite what was submitted earlier).
      this.secondsRemaining = 0;
      this.isFinished = true;
      return;
    }

    this.timerHandle = setInterval(() => {
      this.secondsRemaining--;
      if (this.secondsRemaining <= 0) {
        this.endGame();
      }
    }, 1000);
  }

  private clearTimer() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private endGame() {
    this.clearTimer();
    this.isFinished = true;
    this.partyMemberService.submitScore(this.quizId, this.username, this.score);
  }

  voteReplay() {
    if (this.hasVotedReplay) {
      return;
    }
    this.hasVotedReplay = true;
    this.partyMemberService.voteReplay(this.quizId, this.username);
  }

  // Same anchor-timestamp pattern as startGameTimer above - the deadline
  // comes from the server, not a client-only count from zero, so it stays
  // correct even across a refresh partway through the window.
  private startReplayCountdown(deadline: number) {
    this.clearReplayTimer();
    const tick = () => this.replaySecondsRemaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    tick();
    this.replayTimerHandle = setInterval(tick, 1000);
  }

  private clearReplayTimer() {
    if (this.replayTimerHandle) {
      clearInterval(this.replayTimerHandle);
      this.replayTimerHandle = null;
    }
  }

  backToDashboard() {
    // Otherwise a player who leaves without voting stays counted in
    // quiz.users server-side (until their socket eventually disconnects
    // on its own), which could stall the "everyone's voted" early-resolve
    // check for whoever's still waiting on the replay window.
    this.partyMemberService.leaveQuiz(this.username, this.quizId);
    this.router.navigate(['/']);
  }

  getSortedParty(): string[] {
    return [...this.partyList].sort((a, b) => (this.scores[b] || 0) - (this.scores[a] || 0));
  }

  // Builds a Wordle/Poople-style shareable summary: a row of squares for
  // this player's own answers (without spoiling the actual questions),
  // followed by the party's scoreboard - meant to be pasted into a chat
  // to brag/compare, same spirit as those games' own share buttons.
  async copyResults(tooltip?: any) {
    const squares = this.answerHistory.map(correct => correct ? '🟩' : '🟥').join('');

    const leaderboard = this.getSortedParty().map(person => {
      const score = this.scores[person] !== undefined ? this.scores[person] : '-';
      return person + ': ' + score;
    });

    const lines = [
      '🧠 Quizmastr · Quiz ' + this.quizId,
      '',
      ...(squares.length ? [squares, ''] : []),
      ...leaderboard,
      '',
      'Play at ' + window.location.origin
    ];

    if (!(await ClipboardHelper.copy(lines.join('\n')))) {
      return;
    }
    this.resultsCopied = true;
    ClipboardHelper.refreshTooltip(tooltip);
  }
}
