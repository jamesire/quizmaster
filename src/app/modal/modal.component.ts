import { CommonModule } from '@angular/common';
import {Component, ViewChild, OnInit, NgModule} from '@angular/core';

import {NgbModal, ModalDismissReasons} from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html'
})
@NgModule({
  imports: [ CommonModule ]
})
export class ModalComponent implements OnInit {
  @ViewChild('joinQuizModal') content: any;
  closeResult = '';

  constructor(private modalService: NgbModal) {}

  ngOnInit(): void {
  }

  ngOnChanges() {
  }

  open() {
    // and use the reference from the component itself
    this.modalService.open(this.content).result.then((result) => {
        this.closeResult = `Closed with: ${result}`;
    }, (reason) => {
        console.log(reason);
    });
  }

  private getDismissReason(reason: any): string {
    if (reason === ModalDismissReasons.ESC) {
      return 'by pressing ESC';
    } else if (reason === ModalDismissReasons.BACKDROP_CLICK) {
      return 'by clicking on a backdrop';
    } else {
      return `with: ${reason}`;
    }
  }
}