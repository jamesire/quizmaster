import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PartyMemberService } from 'src/app/party-member/party-member.service';
import { Question } from 'src/app/models/Question';
import { QuestionHelper } from 'src/app/models/QuestionHelper';
import { ClipboardHelper } from 'src/app/models/ClipboardHelper';

@Component({
  selector: 'app-start-quiz',
  templateUrl: './start-quiz.component.html',
  styleUrls: ['./start-quiz.component.scss']
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
  private quizId: string;
  private timerHandle: any;
  private subscription: Subscription;
  private retryHandle: any;
  private retryAttempts: number = 0;
  private readonly maxAutoRetries: number = 3;

  constructor(private route: ActivatedRoute, private router: Router, private partyMemberService: PartyMemberService) { }

  ngOnInit() {
    this.quizId = this.route.snapshot.paramMap.get('quizId');
    this.username = this.route.snapshot.paramMap.get('username');

    // The server generates one shared question set per quiz (on "start")
    // and hands it out on request - this is what keeps every player (and
    // a player who refreshes mid-quiz) seeing the same questions in the
    // same order, instead of each browser fetching its own random set.
    //
    // partyMembers is a single app-wide Subject that outlives this
    // component, so this subscription has to be torn down explicitly in
    // ngOnDestroy - otherwise every quiz played in a session leaves
    // another subscriber behind permanently.
    this.subscription = this.partyMemberService.partyMembers.subscribe(msg => {
      if (msg.action === 'questions' && msg.quizId === this.quizId) {
        this.quizQuestions = QuestionHelper.setAnswerChoices(msg.questions);
        this.partyList = msg.partyList;
        this.scores = msg.scores;
        this.isLoaded = true;
        this.loadError = null;
        this.retryAttempts = 0;
        this.startGameTimer(msg.startedAt);
      }
      else if (msg.action === 'scores' && msg.quizId === this.quizId) {
        this.scores = msg.scores;
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

    this.partyMemberService.getQuestions(this.quizId, this.username);
  }

  ngOnDestroy() {
    this.clearTimer();
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.retryHandle) {
      clearTimeout(this.retryHandle);
      this.retryHandle = null;
    }
  }

  retryLoad() {
    this.loadError = null;
    this.partyMemberService.getQuestions(this.quizId, this.username);
  }

  checkAnswer(i: number) {
    if (this.answerIsSelected || this.isFinished) {
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

  backToDashboard() {
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
    const squares = this.answerHistory.map(correct => correct ? '🟩' : '🟥');
    const rows: string[] = [];
    for (let i = 0; i < squares.length; i += 5) {
      rows.push(squares.slice(i, i + 5).join(''));
    }

    const leaderboard = this.getSortedParty().map(person => {
      const score = this.scores[person] !== undefined ? this.scores[person] : '-';
      return person + ': ' + score;
    });

    const lines = [
      '🧠 Quizmastr · Quiz ' + this.quizId,
      '',
      ...(rows.length ? [rows.join('\n'), ''] : []),
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
