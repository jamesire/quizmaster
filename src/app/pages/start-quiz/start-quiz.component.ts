import { Component, OnInit } from '@angular/core';
import { QuizmasterApiService } from 'src/app/quizmaster-api-client/quizmaster-api-service.service';
import { Router } from '@angular/router';
import { PartyMemberService } from 'src/app/party-member/party-member.service';
import { Question } from 'src/app/models/Question';

@Component({
  selector: 'app-start-quiz',
  templateUrl: './start-quiz.component.html',
  styleUrls: ['./start-quiz.component.css']
})
export class StartQuizComponent implements OnInit {

  public quizQuestions: Question[];

  constructor(private quizMasterApiClient: QuizmasterApiService, private router: Router, private partyMemberService: PartyMemberService) { }

  async ngOnInit() {
    var unwrangledQuestions = await this.quizMasterApiClient.getRandomQuestions(120);

    unwrangledQuestions.forEach(q => {
      var question = {
        
      }
    });
  }

  loadQuestions() {

  }

  timer() {

  }

  addPoint() {
    
  }

}
