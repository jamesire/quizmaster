import { Component, NgModule, ViewChild } from '@angular/core';
import { ModalComponent } from 'src/app/modal/modal.component';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { QuizmasterApiService } from 'src/app/quizmaster-api-client/quizmaster-api-service.service';

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
  public randomQuestion: object;
  @ViewChild('joinQuizModal') modal: ModalComponent;
  private closeResult = '';  

  constructor(private modalService: NgbModal, private quizMasterApiClient:QuizmasterApiService) { }

  async ngOnInit() {
    this.randomQuestion = await this.quizMasterApiClient.getRandomQuestion();
  }

  openShowJoinQuizModal(content) {
    // and use the reference from the component itself
    this.modalService.open(content).result.then((result) => {
        this.closeResult = `Closed with: ${result}`;
    }, (reason) => {
        console.log(reason);
    });
  }

  

  // openShowJoinQuizModal(content) {
  //   this.modal.open();
 // }
}
