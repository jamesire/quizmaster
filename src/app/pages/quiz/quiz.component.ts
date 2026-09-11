import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-quiz',
    templateUrl: './quiz.component.html',
    styleUrls: ['./quiz.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class QuizComponent implements OnInit {

  constructor() { }

  ngOnInit(): void {
  }

}
