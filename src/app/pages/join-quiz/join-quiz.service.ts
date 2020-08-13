import { Injectable } from '@angular/core';
import { WebsocketService } from "../../websocket/websocket.service";
import { Observable, Subject } from 'rxjs/Rx';

@Injectable({
  providedIn: 'root'
})
export class JoinQuizService {

  messages: Subject<any>;

  constructor(private wsService: WebsocketService) { 
    this.messages = <Subject<any>>wsService
      .connectGuest()
      .map((response:any): any => {
        return response;
      });
  }

  sendMsg(msg) {
    this.messages.next(msg);
  }
}
