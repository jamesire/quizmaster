import { Injectable } from '@angular/core';
import * as io from 'socket.io-client';
import { Observable } from 'rxjs/Observable';
import * as Rx from 'rxjs/Rx';
import { environment } from '../../environments/environment';
import { R3ExpressionFactoryMetadata } from '@angular/compiler/src/render3/r3_factory';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {

  private socket;

  constructor() { }

  connect(): Rx.Subject<MessageEvent> {
    this.socket = io(environment.SOCKET_IO_URL);

    let observable = new Observable(observer => {
      this.socket.on('send', (data) => {
        console.log("Received message from websocket server: " + data);
        observer.next(data);
      })
      return () => {
        this.socket.disconnect();
      }
    })

    let observer = {
      next: (data: Object) => {
        this.socket.emit('send', data);
      }
    }

    return Rx.Subject.create(observer, observable);
  }

  // joinRoom(username, quizId) {
  //   var data = {
  //     username,
  //     quizId
  //   };

  //   this.socket.emit('send', data);
  // }

  disconnect() {
    this.socket.emit('disconnect');
  }
}
