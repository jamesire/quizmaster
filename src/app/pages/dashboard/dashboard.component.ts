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

interface SelectedDifficulty {
  value: string,
  index: number
}

@NgModule({
  declarations: [
    ModalComponent
  ]
})
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
  public partyMembers: string[] = [
    "John",
    "Mary",
    "Steve",
    "Ash"
  ]
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
      this.party.push(msg);
      console.log(msg + " has joined...")
    })
    await this.generateRandomQuestion();
  }

  async generateRandomQuestion() {
    this.randomQuestion = await this.quizMasterApiClient.getRandomQuestion();
    this.setAnswerChoices();
    
    this.answers.forEach((ans, index) => {
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
    });
  }

  updateQuestionDifficulty(difficulty: number) {
    this.selectedDifficulty.index = difficulty;
    this.selectedDifficulty.value = this.difficulties[difficulty];
  }

  setAnswerChoices() {
    let possibleAnswers: Answer[] = [];

    this.randomQuestion.incorrectAnswers.forEach(answer => {
      possibleAnswers.push({text: answer, isCorrect: false})
    })

    possibleAnswers.push({text: this.randomQuestion.correctAnswer, isCorrect: true});

    // shuffle answers
    if(possibleAnswers.length > 2) {
      for (let i = possibleAnswers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [possibleAnswers[i], possibleAnswers[j]] = [possibleAnswers[j], possibleAnswers[i]];
      }
    }
    else if(possibleAnswers[0].text === "False") {
      [possibleAnswers[0], possibleAnswers[1]] = [possibleAnswers[1], possibleAnswers[0]];
    }

    this.answers = possibleAnswers;
  }

  checkAnswer(i: number) {
    this.answerIsSelected = true;
    return this.answers[i].isCorrect;
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

  async joinQuiz(quizId, username)
  {
    this.modalService.dismissAll();

    var response = await this.quizMasterApiClient.joinQuiz(quizId, username);

    var message = {
      username: username,
      quizId: quizId
    };

    this.openModal(this.showPartyModalContent);
    this.partyMemberService.joinQuiz(username, quizId);
    //this.router.navigate(['/joinQuiz']);
  }

  async hostQuiz(username: string) {
    
    var response: any = await this.quizMasterApiClient.hostQuiz(username, this.selectedDifficulty.index);
    this.modalService.dismissAll();
    
    if(response.statusCode === 200) {
  
      var message = {
        username: username,
        quizId: response.quizId
      };
  
      //this.router.navigate(['/joinQuiz']);
      this.quizId = response.quizId;
      this.showPartyModal = true;
      this.openModal(this.showPartyModalContent);
      this.partyMemberService.joinQuiz(username, response.quizId);
    }
  }
}
