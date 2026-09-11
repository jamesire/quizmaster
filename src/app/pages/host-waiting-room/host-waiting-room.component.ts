import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-host-waiting-room',
    templateUrl: './host-waiting-room.component.html',
    styleUrls: ['./host-waiting-room.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HostWaitingRoomComponent implements OnInit {

  constructor() { }

  ngOnInit(): void {
  }

}
