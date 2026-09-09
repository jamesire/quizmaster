import { Router } from '@angular/router';
import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { ModalComponent } from 'src/app/modal/modal.component';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Answer } from 'src/app/models/Answer';
import { Question } from 'src/app/models/Question';
import { QuizmasterApiService } from 'src/app/quizmaster-api-client/quizmaster-api-service.service';
import { TriviaPreviewService } from 'src/app/quizmaster-api-client/trivia-preview.service';
import { isSyntheticPropertyOrListener } from '@angular/compiler/src/render3/util';
import { ɵHttpInterceptingHandler } from '@angular/common/http';
import { interval, Subscription, Subject } from 'rxjs';
import { PartyMemberService } from 'src/app/party-member/party-member.service';
import { QuestionHelper } from 'src/app/models/QuestionHelper';
import { ClipboardHelper } from 'src/app/models/ClipboardHelper';
import { CommonModule } from '@angular/common';  
import { BrowserModule } from '@angular/platform-browser';

interface SelectedDifficulty {
  value: string,
  index: number
}


@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})

export class DashboardComponent implements OnInit, OnDestroy {

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
  public readonly difficulties: string[] = [
    "Any",
    "Easy",
    "Medium",
    "Hard"
  ];
  public readonly makeOpaque: string = "change-opacity-on-answer";
  @ViewChild('showPartyModal') showPartyModalContent: any;
  private closeResult = '';  
  private subscription: Subscription;
  public username: string;
  private countdownHandle: any;
  private randomQuestionRetryHandle: any;
  private startRetries: number = 0;
  private startRetryHandle: any;
  private readonly maxAutoRetries: number = 3;

  
  constructor(private modalService: NgbModal, private quizMasterApiClient: QuizmasterApiService, private triviaPreviewService: TriviaPreviewService, private router: Router, private partyMemberService: PartyMemberService)
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
        this.startingQuiz = false;
        this.startRetries = 0;
        this.clearStartRetry();
        this.beginCountdown();
      }
      else if(msg.action === "error")
      {
        console.error("Dashboard message: " + msg.message);

        if (msg.retryable) {
          // A transient failure fetching quiz questions - stay in the
          // party modal and offer a retry instead of dumping the user
          // back to the dashboard with just an alert.
          this.startError = msg.message;

          if (this.startRetries < this.maxAutoRetries) {
            this.startRetries++;
            // 5s matches Open Trivia DB's own rate-limit window -
            // retrying sooner would just fail again. Keep the spinner
            // up through the wait rather than dropping back to the
            // party list, so it reads as "still working" not "done".
            this.startRetryHandle = setTimeout(() => this.startQuiz(false), 5000);
          } else {
            this.startingQuiz = false;
          }
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
  }

  private clearStartRetry() {
    if (this.startRetryHandle) {
      clearTimeout(this.startRetryHandle);
      this.startRetryHandle = null;
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
        this.router.navigate(['/startQuiz', this.quizId, this.username]);
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
    // "join"/"error" cases in the ngOnInit subscription above).
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
    // "hosted" case in the ngOnInit subscription above).
    this.partyMemberService.hostQuiz(username, this.selectedDifficulty.index);
  }

  async copyQuizId(tooltip?: any) {
    if (!(await ClipboardHelper.copy(this.quizId))) {
      return;
    }
    this.quizIdCopied = true;
    ClipboardHelper.refreshTooltip(tooltip);
  }

  private isValidName(name: string): boolean {
    return !!name && name.trim().length >= 2;
  }
}
