import { Injectable } from '@angular/core';
// socket.io-client is pinned to exactly 4.5.4 in package.json (not a
// range) - 4.6.0+ pulls in an engine.io-client whose .d.ts files use
// `import type` syntax, which needs TypeScript >=3.8. Angular 9's
// compiler-cli hard-requires TypeScript <3.8, so anything newer fails
// to build. Don't let `npm audit fix`/Dependabot bump this past 4.5.4
// without also moving off Angular 9's TypeScript ceiling.
import { io } from 'socket.io-client';
import { Subject } from 'rxjs';
import * as Rx from 'rxjs/Rx';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {

  private socket;
  // A real multicast Subject relaying every incoming "send" message.
  // The socket's "send" listener is registered against this exactly
  // once, for the app's lifetime - any number of components can
  // subscribe/unsubscribe from what connect() returns without affecting
  // this, or the socket connection, at all. (Previously connect()
  // wrapped the socket in a plain cold Observable, whose producer
  // function re-ran - registering another socket.on('send', ...)
  // listener - on every single .subscribe(), and whose teardown called
  // this.socket.disconnect(). That meant any one component unsubscribing
  // killed the entire app's connection, not just its own listener -
  // invisible as long as nothing ever unsubscribed, which is exactly
  // what changed once components started properly cleaning up their
  // subscriptions.)
  private incoming = new Subject<any>();

  connect(): Rx.Subject<MessageEvent> {
    if (!this.socket) {
      // An empty URL means "same origin as this page" - io() with no
      // argument connects to whatever host served the app.
      this.socket = environment.SOCKET_IO_URL ? io(environment.SOCKET_IO_URL) : io();
      this.socket.on('send', (data) => {
        this.incoming.next(data);
      });
    }

    let observer = {
      next: (data: Object) => {
        this.socket.emit('send', data);
      }
    }

    return Rx.Subject.create(observer, this.incoming);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
