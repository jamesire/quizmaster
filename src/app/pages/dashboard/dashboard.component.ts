import { Router, ActivatedRoute } from '@angular/router';
import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild } from '@angular/core';
import { ModalComponent } from 'src/app/modal/modal.component';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Answer } from 'src/app/models/Answer';
import { Question } from 'src/app/models/Question';
import { QuizmasterApiService } from 'src/app/quizmaster-api-client/quizmaster-api-service.service';
import { TriviaPreviewService } from 'src/app/quizmaster-api-client/trivia-preview.service';
import { interval, Subscription, Subject } from 'rxjs';
import { PartyMemberService } from 'src/app/party-member/party-member.service';
import { QuestionHelper } from 'src/app/models/QuestionHelper';
import { ClipboardHelper } from 'src/app/models/ClipboardHelper';
import { QuizLinkToken } from 'src/app/models/QuizLinkToken';

interface SelectedDifficulty {
  value: string,
  index: number
}


@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})

export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {

  public showJoinQuizModal: boolean = false;
  public showHostQuizModal: boolean = false;
  public showPartyModal: boolean = false;
  public randomQuestion: Question;
  public answers: Answer[];
  public isLoaded: boolean = false;
  public answerIsSelected: boolean = false;
  public selectedDifficulty: SelectedDifficulty;
  public css: string[] = [];
  public quizId: string;
  public userIsHost: boolean = false;
  public showSpinner = false;
  public party: string[] = [];
  public countdown: number = null;
  public startingQuiz: boolean = false;
  public startError: string = null;
  public joinNameError: boolean = false;
  public hostNameError: boolean = false;
  public quizIdCopied: boolean = false;
  public prefillQuizId: string = '';
  public readonly difficulties: string[] = [
    "Any",
    "Easy",
    "Medium",
    "Hard"
  ];
  public readonly makeOpaque: string = "change-opacity-on-answer";
  @ViewChild('showPartyModal') showPartyModalContent: any;
  @ViewChild('joinQuizModal') joinQuizModalContent: any;
  private closeResult = '';  
  private subscription: Subscription;
  public username: string;
  private countdownHandle: any;
  private randomQuestionRetryHandle: any;
  private startRetries: number = 0;
  private startRetryHandle: any;
  private startTimeoutHandle: any;
  private hostTimeoutHandle: any;
  private joinTimeoutHandle: any;
  private readonly maxAutoRetries: number = 3;
  // Production connections (polling-only, behind Cloudflare, session
  // state wiped on every redeploy) have shown real flakiness where a
  // server response - success or error - simply never arrives. Without
  // this, hostQuiz/joinQuiz/startQuiz would wait forever: a closed modal
  // with nothing ever happening, or a spinner that never resolves.
  private readonly confirmationTimeoutMs: number = 8000;

  
  constructor(private modalService: NgbModal, private quizMasterApiClient: QuizmasterApiService, private triviaPreviewService: TriviaPreviewService, private router: Router, private route: ActivatedRoute, private partyMemberService: PartyMemberService)
  {
    var defaultIndex = 0;
    var defaultDifficulty = this.difficulties[defaultIndex];

    this.selectedDifficulty = {
      value: defaultDifficulty,
      index: defaultIndex
    }
  }

  async ngOnInit() {
    // Angular recreates this component every time you navigate back to
    // /dashboard (e.g. "Back to dashboard" after a quiz), but
    // partyMembers is a single app-wide Subject that outlives any one
    // component - without unsubscribing in ngOnDestroy, every visit adds
    // another subscriber that's never removed, and after a few rounds
    // every socket message ends up triggering navigation/modals/alerts
    // from several dead component instances at once.
    this.subscription = this.partyMemberService.partyMembers.subscribe(msg => {
      if(msg.action === "hosted") {
        // Server generated our quiz ID - now we can show the party modal.
        this.clearHostTimeout();
        this.quizId = msg.quizId;
        this.party = msg.partyList;
        this.userIsHost = true;
        this.showPartyModal = true;
        this.openModal(this.showPartyModalContent);
      }
      else if(msg.action === "join") {
        this.party = msg.partyList;
        if(!this.showPartyModal && msg.username === this.username) {
          // This is our own join being confirmed by the server.
          this.clearJoinTimeout();
          this.showPartyModal = true;
          this.openModal(this.showPartyModalContent);
        }
        console.log("Dashboard message: " + msg.username + " has joined...");
      }
      else if (msg.action === "leave") {
        this.party = msg.partyList;
      }
      else if(msg.action === "start")
      {
        this.clearStartTimeout();
        this.startingQuiz = false;
        this.startRetries = 0;
        this.clearStartRetry();
        this.beginCountdown();
      }
      else if(msg.action === "error")
      {
        console.error("Dashboard message: " + msg.message);

        // Any error response means the server is there and answering -
        // whichever request was still pending got its response.
        this.clearHostTimeout();
        this.clearJoinTimeout();
        this.clearStartTimeout();

        if (msg.retryable) {
          this.handleRetryableStartFailure(msg.message);
        } else {
          // Something retrying can't fix (bad quiz ID, username taken,
          // quiz full, room gone) - nothing to show a spinner for.
          this.modalService.dismissAll();
          alert(msg.message);
        }
      }
    })
    await this.loadCurrentQuestion();
  }

  ngAfterViewInit() {
    // A shared invite link (?qid=ABCDEF, see copyQuizId below) lands
    // here - jump straight to the Join modal with the ID already filled
    // in so the visitor only has to pick a name, rather than making them
    // find and retype a code they were just handed.
    const qid = this.route.snapshot.queryParamMap.get('qid');
    if (qid) {
      this.prefillQuizId = qid.trim().toUpperCase();
      this.openModal(this.joinQuizModalContent);
    }
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    this.clearCountdown();
    if (this.randomQuestionRetryHandle) {
      clearTimeout(this.randomQuestionRetryHandle);
      this.randomQuestionRetryHandle = null;
    }
    this.clearStartRetry();
    this.clearStartTimeout();
    this.clearHostTimeout();
    this.clearJoinTimeout();
  }

  // Loads whatever question TriviaPreviewService says is "current" - a
  // freshly fetched one on a genuinely first visit, or the same one
  // shown before a refresh, in the same shuffled answer order, if it
  // hasn't been answered yet.
  async loadCurrentQuestion() {
    try {
      const question = await this.triviaPreviewService.getCurrentQuestion();
      this.applyQuestion(question);
    } catch (err) {
      // Open Trivia DB rate-limits to ~1 request per 5 seconds per IP.
      // This tile has no error state and no manual retry - just a
      // spinner until it succeeds - so it keeps trying indefinitely
      // rather than giving up after a fixed number of attempts.
      console.error('Could not load a preview trivia question: ' + err);
      this.randomQuestionRetryHandle = setTimeout(() => this.loadCurrentQuestion(), 5000);
    }
  }

  private applyQuestion(question: Question) {
    this.randomQuestion = question;

    this.randomQuestion.allAnswers.forEach((ans, index) => {
      this.css[index] = ans.isCorrect ? "correct-answer" : "incorrect-answer";
    })
    this.answerIsSelected = false;
    this.isLoaded = true;
  }

  openModal(content) {
    // and use the reference from the component itself
    this.modalService.open(content).result.then((result) => {
        this.closeResult = `Closed with: ${result}`;
    }, (reason) => {
        console.log(reason);
        if(reason === "Cross click")
        {
          this.partyMemberService.leaveQuiz(this.username, this.quizId);
        }
    });
  }

  updateQuestionDifficulty(difficulty: number) {
    this.selectedDifficulty.index = difficulty;
    this.selectedDifficulty.value = this.difficulties[difficulty];
  }

  checkAnswer(i: number) {
    if (this.answerIsSelected) {
      return;
    }

    this.answerIsSelected = true;
    const isCorrect = this.randomQuestion.allAnswers[i].isCorrect;

    // Keep showing this question (highlighted) for a beat, then move on
    // to the next one - only now does the "current" question actually
    // advance, matching "keep the same question until it's answered".
    setTimeout(async () => {
      try {
        const next = await this.triviaPreviewService.advance();
        this.applyQuestion(next);
      } catch (err) {
        console.error('Could not load the next preview trivia question: ' + err);
        this.randomQuestionRetryHandle = setTimeout(() => this.loadCurrentQuestion(), 5000);
      }
    }, 2500);

    return isCorrect;
  }

  // isManualAttempt is false only when this is called from the automatic
  // retry timer - a fresh user-initiated click (the default) gets its
  // own full batch of auto-retries rather than inheriting however many
  // of the previous batch were already used.
  startQuiz(isManualAttempt: boolean = true) {
    if (isManualAttempt) {
      this.startRetries = 0;
    }
    this.clearStartRetry();
    this.startingQuiz = true;
    this.startError = null;
    this.partyMemberService.startQuiz(this.quizId);

    // Covers total silence - neither a "start" nor an "error" ever
    // arriving - which the retry logic above can't react to since it
    // only fires off a message that was actually received.
    this.clearStartTimeout();
    this.startTimeoutHandle = setTimeout(() => {
      this.startTimeoutHandle = null;
      console.error('Dashboard message: start request timed out with no server response');
      this.handleRetryableStartFailure('The server didn\'t respond. Retrying...');
    }, this.confirmationTimeoutMs);
  }

  // Shared by both the "server explicitly said this is retryable" path
  // and the "server never responded at all" watchdog - same recovery
  // either way: stay in the party modal and either auto-retry or give up
  // after maxAutoRetries, rather than dumping the user back out with an
  // alert or leaving the spinner stuck forever.
  private handleRetryableStartFailure(message: string) {
    this.startError = message;

    if (this.startRetries < this.maxAutoRetries) {
      this.startRetries++;
      // 5s matches Open Trivia DB's own rate-limit window - retrying
      // sooner would just fail again. Keep the spinner up through the
      // wait rather than dropping back to the party list, so it reads
      // as "still working" not "done".
      this.startRetryHandle = setTimeout(() => this.startQuiz(false), 5000);
    } else {
      this.startingQuiz = false;
    }
  }

  private clearStartRetry() {
    if (this.startRetryHandle) {
      clearTimeout(this.startRetryHandle);
      this.startRetryHandle = null;
    }
  }

  private clearStartTimeout() {
    if (this.startTimeoutHandle) {
      clearTimeout(this.startTimeoutHandle);
      this.startTimeoutHandle = null;
    }
  }

  private clearHostTimeout() {
    if (this.hostTimeoutHandle) {
      clearTimeout(this.hostTimeoutHandle);
      this.hostTimeoutHandle = null;
    }
  }

  private clearJoinTimeout() {
    if (this.joinTimeoutHandle) {
      clearTimeout(this.joinTimeoutHandle);
      this.joinTimeoutHandle = null;
    }
  }

  // Runs in the party modal for host and guests alike - everyone gets the
  // same "start" broadcast at roughly the same time, so this gives a
  // shared beat before dropping into the quiz instead of jumping in
  // instantly.
  private beginCountdown() {
    this.countdown = 3;

    this.countdownHandle = setInterval(() => {
      this.countdown--;

      if (this.countdown <= 0) {
        this.clearCountdown();
        this.modalService.dismissAll();
        this.router.navigate(['/play', QuizLinkToken.encode(this.quizId, this.username)]);
      }
    }, 1000);
  }

  private clearCountdown() {
    if (this.countdownHandle) {
      clearInterval(this.countdownHandle);
      this.countdownHandle = null;
    }
  }

  joinQuiz(quizId, username) {
    if (!this.isValidName(username)) {
      this.joinNameError = true;
      return;
    }
    this.joinNameError = false;

    this.modalService.dismissAll();

    this.username = username;
    this.quizId = quizId;
    this.userIsHost = false;
    this.quizIdCopied = false;

    // The party modal opens once the server confirms the join (see the
    // "join"/"error" cases in the ngOnInit subscription above). The
    // modal above is already dismissed by this point, so if that
    // confirmation is lost in transit (dropped/flaky connection, a
    // stale session after a redeploy), there'd otherwise be nothing left
    // on screen to tell the user anything went wrong at all.
    this.clearJoinTimeout();
    this.joinTimeoutHandle = setTimeout(() => {
      this.joinTimeoutHandle = null;
      alert('Could not join the quiz - the server didn\'t respond in time. Please try again.');
    }, this.confirmationTimeoutMs);

    this.partyMemberService.joinQuiz(username, quizId);
  }

  hostQuiz(username: string) {
    if (!this.isValidName(username)) {
      this.hostNameError = true;
      return;
    }
    this.hostNameError = false;

    this.modalService.dismissAll();

    this.username = username;
    this.quizIdCopied = false;

    // The party modal opens once the server assigns a quiz ID (see the
    // "hosted" case in the ngOnInit subscription above). The modal above
    // is already dismissed by this point, so if that confirmation is
    // lost in transit (dropped/flaky connection, a stale session after a
    // redeploy), there'd otherwise be nothing left on screen to tell the
    // user anything went wrong at all - just a closed modal and silence.
    this.clearHostTimeout();
    this.hostTimeoutHandle = setTimeout(() => {
      this.hostTimeoutHandle = null;
      alert('Could not create the quiz - the server didn\'t respond in time. Please try again.');
    }, this.confirmationTimeoutMs);

    this.partyMemberService.hostQuiz(username, this.selectedDifficulty.index);
  }

  // Copies a full invite message rather than just the bare ID - the code
  // alone means a friend has to go find the site and the Join modal
  // themselves, so this also hands them a direct link (?qid=...) that
  // the Join modal picks up above to skip straight to entering a name.
  async copyQuizId(tooltip?: any) {
    const link = `${window.location.origin}/?qid=${this.quizId}`;
    const message = `${this.username} has invited you to Quizmastr! 🧠\n\n` +
      `Join with code: ${this.quizId}\n` +
      `Or use this link: ${link}`;

    if (!(await ClipboardHelper.copy(message))) {
      return;
    }
    this.quizIdCopied = true;
    ClipboardHelper.refreshTooltip(tooltip);
  }

  private isValidName(name: string): boolean {
    return !!name && name.trim().length >= 2;
  }
}
