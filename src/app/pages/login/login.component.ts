import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class LoginComponent implements OnInit, OnDestroy {
  constructor() {}

  ngOnInit() {
  }
  ngOnDestroy() {
  }

}
