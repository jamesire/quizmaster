import { Component, OnInit } from '@angular/core';
import { JoinQuizService } from './join-quiz.service';

@Component({
  selector: 'app-join-quiz',
  templateUrl: './join-quiz.component.html',
  styleUrls: ['./join-quiz.component.css']
})
export class JoinQuizComponent implements OnInit {

  constructor(private jqService: JoinQuizService) { }

  ngOnInit(): void {
    this.jqService.messages.subscribe(msg => {
      console.log(msg);
    })

    this.sendMessage();
  }

  sendMessage() {
   
  }

}
