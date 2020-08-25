import { Injectable } from '@angular/core';
import { Subject } from 'rxjs/Rx';
import { WebsocketService } from '../websocket/websocket.service';

@Injectable({
  providedIn: 'root'
})
export class PartyMemberService {

  public partyMembers: Subject<any>;

  constructor(private wsService: WebsocketService) { 
    this.partyMembers = <Subject<any>>this.wsService
    .connect()
    .map((response: any): any => {
      return response;
    })
  }

  joinQuiz(username, quizId) {
    var data = {
      username,
      quizId
    }

    this.wsService.joinRoom(username, quizId);

    this.partyMembers.next(username);
  }
}
