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

    //this.wsService.joinRoom(username, quizId);

    var partyMembersData = {
      username: username,
      quizId: quizId,
      action: 'join'
    }

    this.partyMembers.next(partyMembersData);
  }

  leaveQuiz(username, quizId) {
    this.wsService.disconnect();
    
    var partyMembersData = {
      username: username,
      quizId: quizId,
      action: 'leave'
    }

    this.partyMembers.next(partyMembersData);
  }

}
