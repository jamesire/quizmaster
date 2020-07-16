import { Component, NgModule, ViewChild } from '@angular/core';
import { ModalComponent } from 'src/app/modal/modal.component';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Answer } from 'src/app/models/Answer';
import { Question } from 'src/app/models/Question';
import { QuizmasterApiService } from 'src/app/quizmaster-api-client/quizmaster-api-service.service';
import { isSyntheticPropertyOrListener } from '@angular/compiler/src/render3/util';
import { ɵHttpInterceptingHandler } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';

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
  public randomQuestion: Question;
  public answers: Answer[];
  public isLoaded: boolean = false;
  public answerIsSelected: boolean = false;
  public css: string[] = [];
  public readonly makeOpaque: string = "change-opacity-on-answer";
  @ViewChild('joinQuizModal') modal: ModalComponent;
  private closeResult = '';  
  private subscription: Subscription;
  private timeoutInAction: boolean = false;
  
  constructor(private modalService: NgbModal, private quizMasterApiClient:QuizmasterApiService) 
  { 
  }

  async ngOnInit() {
    // this.subscription = this.source.subscribe(() => {
    //   if(this.answerIsSelected) {
    //     this.generateRandomQuestion();
    //   }
    // });

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

  openJoinQuizModal(content) {
    // and use the reference from the component itself
    this.modalService.open(content).result.then((result) => {
        this.closeResult = `Closed with: ${result}`;
    }, (reason) => {
        console.log(reason);
    });
  }

  openHostQuizModal(content) {
    // and use the reference from the component itself
    this.modalService.open(content).result.then((result) => {
        this.closeResult = `Closed with: ${result}`;
    }, (reason) => {
        console.log(reason);
    });
  }

  setAnswerChoices() {
    let possibleAnswers: Answer[] = [];

    this.randomQuestion.incorrectAnswers.forEach(answer => {
      possibleAnswers.push({text: answer, isCorrect: false})
    })

    possibleAnswers.push({text: this.randomQuestion.correctAnswer, isCorrect: true});

    // shuffle answers
    for (let i = possibleAnswers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [possibleAnswers[i], possibleAnswers[j]] = [possibleAnswers[j], possibleAnswers[i]];
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
}
