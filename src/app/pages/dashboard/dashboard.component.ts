import { Component, NgModule, ViewChild } from '@angular/core';
import { ModalComponent } from 'src/app/modal/modal.component';

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
  @ViewChild('joinQuizModal') modal: ModalComponent;

  constructor() { }

  openShowJoinQuizModal() {
    this.modal.open();
  }
}
