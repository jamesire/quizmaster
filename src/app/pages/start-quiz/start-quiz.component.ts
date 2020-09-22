import { Component, NgModule, OnInit } from '@angular/core';
import { QuizmasterApiService } from 'src/app/quizmaster-api-client/quizmaster-api-service.service';
import { Router } from '@angular/router';
import { PartyMemberService } from 'src/app/party-member/party-member.service';
import { Question } from 'src/app/models/Question';
import { QuestionHelper } from 'src/app/models/QuestionHelper';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-start-quiz',
  templateUrl: './start-quiz.component.html',
  styleUrls: ['./start-quiz.component.scss']
})
@NgModule ({
  imports: [ CommonModule ]
})
export class StartQuizComponent implements OnInit {
  private timeoutInAction: boolean = false;
  public  questionIndex: number = 0;
  public readonly makeOpaque: string = "change-opacity-on-answer";
  public isLoaded: boolean = false;
  public answerIsSelected: boolean = false;
  public quizQuestions: Question[];
  public css: string[] = [];
  public score: number = 0;

  constructor(private quizMasterApiClient: QuizmasterApiService, private router: Router, private partyMemberService: PartyMemberService) { }

  async ngOnInit() {
    var response = await this.quizMasterApiClient.getRandomQuestions(50);
    this.quizQuestions = QuestionHelper.setAnswerChoices(response);
    this.isLoaded = true;
  }

  processQuestion() {
    this.quizQuestions[this.questionIndex].allAnswers.forEach((ans, index) => {
      this.css[index] = ans.isCorrect ? "correct-answer" : "incorrect-answer";
    })
    this.incrementIndex();
    this.answerIsSelected = false;
  }

  checkAnswer(i: number) {
    if(!this.answerIsSelected) {
      this.answerIsSelected = true;

      let answerIsCorrect = this.quizQuestions[this.questionIndex].allAnswers[i].isCorrect;

      if (answerIsCorrect) 
      {
        this.score++;
      }

      return answerIsCorrect;
    }
  }

  regenerateQuestion() {
    if(!this.timeoutInAction) {
      setTimeout(() => { 
        this.processQuestion();
        this.timeoutInAction = false;
      }, 2500);
    }

    this.timeoutInAction = true;
    return this.makeOpaque;
  }

  loadQuestions() {

  }

  timer() {

  }

  incrementIndex() {
    this.questionIndex++;
  }

  getQuestion() {
    return this.quizQuestions[this.questionIndex];
  }

  addPoint() {
    
  }

}
