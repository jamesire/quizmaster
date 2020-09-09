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

interface SelectedDifficulty {
  value: string,
  index: number
}


@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
// @NgModule({
//   declarations: [ ModalComponent ]
// })
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
      if(msg.action === "join") {
        //this.party.push(msg.username);
        this.party = msg.partyList;
        console.log("Dashboard message: " + msg.username + " has joined...");
      }
      else if(msg.action === "ppp") {
        console.log("Dashboard message: thing said ppp");
      }
      else if (msg.action === "leave") {
        this.party = msg.partyList;
        // var index = this.party.indexOf(msg.username);
        // if(index > -1) {
        //   this.party.splice(index, 1);
        //   console.log("Dashboard message: " + msg.username + " has left...")
        // }
      }
      else if(msg.action === "start")
      {
        this.router.navigate(['/startQuiz']);
        this.modalService.dismissAll();
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

  async joinQuiz(quizId, username) {
    this.modalService.dismissAll();
    
    var response = await this.quizMasterApiClient.joinQuiz(quizId, username);
    
    this.username = username;
    this.quizId = quizId;

    var message = {
      username: username,
      quizId: quizId
    };

    this.userIsHost = false;
    this.showPartyModal = true;
    this.openModal(this.showPartyModalContent);
    this.partyMemberService.joinQuiz(username, quizId);
  }

  async hostQuiz(username: string) {
    this.username = username;
    var response: any = await this.quizMasterApiClient.hostQuiz(username, this.selectedDifficulty.index);
    this.modalService.dismissAll();
    
    if(response.statusCode === 200) {
  
      var message = {
        username: username,
        quizId: response.quizId
      };
  
      this.quizId = response.quizId;
      this.showPartyModal = true;
      this.userIsHost = true;
      this.openModal(this.showPartyModalContent);
      this.partyMemberService.joinQuiz(username, response.quizId);
    }
  }
}
