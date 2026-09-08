import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PartyMemberService } from 'src/app/party-member/party-member.service';
import { Question } from 'src/app/models/Question';
import { QuestionHelper } from 'src/app/models/QuestionHelper';

@Component({
  selector: 'app-start-quiz',
  templateUrl: './start-quiz.component.html',
  styleUrls: ['./start-quiz.component.scss']
})

export class StartQuizComponent implements OnInit {
  public  questionIndex: number = 0;
  public readonly makeOpaque: string = "change-opacity-on-answer";
  public isLoaded: boolean = false;
  public answerIsSelected: boolean = false;
  public quizQuestions: Question[];
  public css: string[] = [];
  public score: number = 0;
  private quizId: string;

  constructor(private route: ActivatedRoute, private partyMemberService: PartyMemberService) { }

  ngOnInit() {
    this.quizId = this.route.snapshot.paramMap.get('quizId');

    // The server generates one shared question set per quiz (on "start")
    // and hands it out on request - this is what keeps every player (and
    // a player who refreshes mid-quiz) seeing the same questions in the
    // same order, instead of each browser fetching its own random set.
    this.partyMemberService.partyMembers.subscribe(msg => {
      if (msg.action === 'questions' && msg.quizId === this.quizId) {
        this.quizQuestions = QuestionHelper.setAnswerChoices(msg.questions);
        this.isLoaded = true;
      }
      else if (msg.action === 'error') {
        console.error('Start quiz message: ' + msg.message);
      }
    });

    this.partyMemberService.getQuestions(this.quizId);
  }

  checkAnswer(i: number) {
    if (this.answerIsSelected) {
      return;
    }

    this.answerIsSelected = true;

    // Highlight every answer for the question just answered right away.
    // This used to happen inside a 2.5s setTimeout, by which point
    // answerIsSelected had already been reset back to false - so the
    // highlight was computed against the wrong question and never
    // actually rendered while visible.
    this.quizQuestions[this.questionIndex].allAnswers.forEach((answer, index) => {
      this.css[index] = answer.isCorrect ? "correct-answer" : "incorrect-answer";
    });

    if (this.quizQuestions[this.questionIndex].allAnswers[i].isCorrect) {
      this.score++;
    }

    setTimeout(() => {
      this.questionIndex++;
      this.answerIsSelected = false;
      this.css = [];
    }, 2500);
  }
}
