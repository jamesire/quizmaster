import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { SinglePlayerApiService, RawQuestion } from 'src/app/quizmaster-api-client/single-player-api.service';
import { Question } from 'src/app/models/Question';
import { QuestionHelper } from 'src/app/models/QuestionHelper';
import { ClipboardHelper } from 'src/app/models/ClipboardHelper';

// Solo practice mode - deliberately has no socket/PartyMemberService
// dependency at all, unlike StartQuizComponent. There's no party to sync
// state with here, so every piece of this component's state is entirely
// self-contained: fetch a question set over plain HTTP
// (SinglePlayerApiService, see server.js's /api/single-player-questions
// and the anti-cheat reasoning there), run a client-only 30s countdown,
// score locally, done. A fresh component rather than retrofitting
// StartQuizComponent, which is wired end-to-end to socket messages for
// party list/per-player scores/replay voting/multi-tab detection - none
// of which apply solo, and branching all of that for "no socket" would
// have made an already-complex component harder to follow.
@Component({
  selector: 'app-single-player',
  templateUrl: './single-player.component.html',
  styleUrls: ['./single-player.component.scss', '../start-quiz/start-quiz.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class SinglePlayerComponent implements OnInit, OnDestroy {
  public readonly secondsForGame: number = 30;
  public secondsRemaining: number = this.secondsForGame;
  public questionIndex: number = 0;
  public readonly makeOpaque: string = "change-opacity-on-answer";
  public isLoaded: boolean = false;
  public isFinished: boolean = false;
  public answerIsSelected: boolean = false;
  public quizQuestions: Question[];
  public css: string[] = [];
  public score: number = 0;
  public loadError: string = null;
  public loadErrorRetryable: boolean = false;
  public answerHistory: boolean[] = [];
  public resultsCopied: boolean = false;
  public scoreStarFlip: boolean = false;
  // null outside the pre-game beat; 3/2/1 while it's running. Matches
  // dashboard.component.ts's own 3-2-1 (beginCountdown()) before a
  // multiplayer quiz starts - questions load instantly here since
  // there's no server round-trip, so without this the player would go
  // straight from a spinner into a live, already-ticking question with
  // no beat to get oriented first.
  public countdown: number = null;
  // Toggled false then back to true on every tick (see
  // triggerCountdownPulse()) so the pop-in animation on the countdown
  // circle actually restarts each second - same off-then-on-next-tick
  // trick as triggerScoreStarFlip() below, since just changing the
  // number inside an already-present element doesn't restart a CSS
  // animation on its own.
  public countdownPulse: boolean = false;
  private timerHandle: any;
  private countdownHandle: any;
  private countdownPulseHandle: any;
  private scoreStarFlipHandle: any;

  constructor(private router: Router, private singlePlayerApi: SinglePlayerApiService) { }

  ngOnInit() {
    this.startRound();
  }

  ngOnDestroy() {
    this.clearTimer();
    this.clearCountdown();
    if (this.scoreStarFlipHandle) {
      clearTimeout(this.scoreStarFlipHandle);
      this.scoreStarFlipHandle = null;
    }
  }

  // Resets every piece of per-round state and fetches a fresh question
  // set - used both for the initial load and for "Play Again", so a
  // replayed round can never inherit anything (score, answered history,
  // a half-expired timer) from the round that just finished.
  private async startRound() {
    this.clearTimer();
    this.clearCountdown();
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
    this.loadError = null;
    this.loadErrorRetryable = false;
    this.answerHistory = [];
    this.resultsCopied = false;
    this.scoreStarFlip = false;
    this.secondsRemaining = this.secondsForGame;

    await this.loadQuestions();
  }

  private async loadQuestions() {
    try {
      const raw: RawQuestion[] = await this.singlePlayerApi.getQuestions();
      this.quizQuestions = QuestionHelper.setAnswerChoices(raw);
      this.isLoaded = true;
      this.loadError = null;
      this.beginCountdown();
    } catch (err) {
      console.error('Single player question load failed: ' + err);
      this.loadError = 'Could not load quiz questions. Please try again.';
      this.loadErrorRetryable = true;
    }
  }

  retryLoad() {
    this.loadError = null;
    this.loadQuestions();
  }

  // Same 3-2-1 beat as dashboard.component.ts's beginCountdown(), just
  // run locally here instead of on the dashboard before navigating -
  // there's no separate "party" screen to show it on in single player.
  private beginCountdown() {
    this.countdown = 3;
    this.triggerCountdownPulse();
    this.countdownHandle = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        this.clearCountdown();
        this.startGameTimer();
        return;
      }
      this.triggerCountdownPulse();
    }, 1000);
  }

  private clearCountdown() {
    if (this.countdownHandle) {
      clearInterval(this.countdownHandle);
      this.countdownHandle = null;
    }
    if (this.countdownPulseHandle) {
      clearTimeout(this.countdownPulseHandle);
      this.countdownPulseHandle = null;
    }
    this.countdown = null;
    this.countdownPulse = false;
  }

  // Same shape as triggerScoreStarFlip() below - clear the class, then
  // re-add it on the next tick so Angular actually sees a false-then-
  // true change and restarts the CSS animation, rather than a no-op if
  // it were just set true again while already true.
  private triggerCountdownPulse() {
    if (this.countdownPulseHandle) {
      clearTimeout(this.countdownPulseHandle);
    }
    this.countdownPulse = false;
    this.countdownPulseHandle = setTimeout(() => this.countdownPulse = true);
  }

  // No server-anchored startedAt to reconcile against here (nothing else
  // needs to stay in sync with this clock) - just start counting down
  // from secondsForGame once the pre-game countdown above finishes.
  private startGameTimer() {
    this.timerHandle = setInterval(() => {
      this.secondsRemaining--;
      if (this.secondsRemaining <= 0) {
        this.endGame();
      }
    }, 1000);
  }

  checkAnswer(i: number) {
    if (this.answerIsSelected || this.isFinished) {
      return;
    }

    this.answerIsSelected = true;

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

      if (this.questionIndex + 1 < this.quizQuestions.length) {
        this.questionIndex++;
      }
    }, 2500);
  }

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

  private clearTimer() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private endGame() {
    this.clearTimer();
    this.isFinished = true;
  }

  playAgain() {
    this.startRound();
  }

  backToDashboard() {
    this.router.navigate(['/']);
  }

  // Same Wordle-style shareable summary as StartQuizComponent's
  // copyResults(), minus the leaderboard lines - there's no party to
  // compare against solo.
  async copyResults(tooltip?: any) {
    const squares = this.answerHistory.map(correct => correct ? '🟩' : '🟥').join('');

    const lines = [
      '🧠 Quizmastr · Single Player',
      '',
      ...(squares.length ? [squares, ''] : []),
      'Score: ' + this.score,
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
