import { Injectable } from '@angular/core';
// socket.io-client is pinned to exactly 4.5.4 in package.json (not a
// range) - 4.6.0+ pulls in an engine.io-client whose .d.ts files use
// `import type` syntax, which needs TypeScript >=3.8. Angular 9's
// compiler-cli hard-requires TypeScript <3.8, so anything newer fails
// to build. Don't let `npm audit fix`/Dependabot bump this past 4.5.4
// without also moving off Angular 9's TypeScript ceiling.
import { io } from 'socket.io-client';
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
    // An empty URL means "same origin as this page" - io() with no
    // argument connects to whatever host served the app.
    this.socket = environment.SOCKET_IO_URL ? io(environment.SOCKET_IO_URL) : io();

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
