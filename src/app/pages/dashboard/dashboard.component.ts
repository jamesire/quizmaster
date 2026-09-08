import { Router } from '@angular/router';
import { Component, NgModule, ViewChild } from '@angular/core';
import { ModalComponent } from 'src/app/modal/modal.component';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Answer } from 'src/app/models/Answer';
import { Question } from 'src/app/models/Question';
import { QuizmasterApiService } from 'src/app/quizmaster-api-client/quizmaster-api-service.service';
import { isSyntheticPropertyOrListener } from '@angular/compiler/src/render3/util';
import { ɵHttpInterceptingHandler } from '@angular/common/http';
import { interval, Subscription, Subject } from 'rxjs';
import { PartyMemberService } from 'src/app/party-member/party-member.service';
import { QuestionHelper } from 'src/app/models/QuestionHelper';
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

export class DashboardComponent {

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
  private timeoutInAction: boolean = false;
  private username: string;

  
  constructor(private modalService: NgbModal, private quizMasterApiClient: QuizmasterApiService, private router: Router, private partyMemberService: PartyMemberService) 
  { 
    var defaultIndex = 0;
    var defaultDifficulty = this.difficulties[defaultIndex];

    this.selectedDifficulty = {
      value: defaultDifficulty,
      index: defaultIndex
    }
  }

  async ngOnInit() {
    this.partyMemberService.partyMembers.subscribe(msg => {
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
        this.router.navigate(['/startQuiz']);
        this.modalService.dismissAll();
      }
      else if(msg.action === "error")
      {
        this.modalService.dismissAll();
        console.error("Dashboard message: " + msg.message);
        alert(msg.message);
      }
    })
    await this.generateRandomQuestion();
  }

  async generateRandomQuestion() {
    var questionList = await this.quizMasterApiClient.getRandomQuestions();
    this.randomQuestion = questionList[0];
    this.randomQuestion = QuestionHelper.setAnswerChoices(this.randomQuestion)[0];
    
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
    this.answerIsSelected = true;
    return this.randomQuestion.allAnswers[i].isCorrect;
  }

  regenerateRandomQuestion() {
    if(!this.timeoutInAction) {
      setTimeout(async () => { 
        await this.generateRandomQuestion();
        this.timeoutInAction = false;
      }, 2500);
    }

    this.timeoutInAction = true;
    return this.makeOpaque;
  }

  startQuiz() {
    this.partyMemberService.startQuiz(this.quizId);
  }

  joinQuiz(quizId, username) {
    this.modalService.dismissAll();

    this.username = username;
    this.quizId = quizId;
    this.userIsHost = false;

    // The party modal opens once the server confirms the join (see the
    // "join"/"error" cases in the ngOnInit subscription above).
    this.partyMemberService.joinQuiz(username, quizId);
  }

  hostQuiz(username: string) {
    this.modalService.dismissAll();

    this.username = username;

    // The party modal opens once the server assigns a quiz ID (see the
    // "hosted" case in the ngOnInit subscription above).
    this.partyMemberService.hostQuiz(username, this.selectedDifficulty.index);
  }
}
