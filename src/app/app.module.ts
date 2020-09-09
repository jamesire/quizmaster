import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { RouterModule } from '@angular/router';

import { AppComponent } from './app.component';
import { AdminLayoutComponent } from './layouts/admin-layout/admin-layout.component';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component';

import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { AppRoutingModule } from './app.routing';
import { ComponentsModule } from './components/components.module';
import { BrowserModule } from '@angular/platform-browser';
import { ClientInterceptorComponent } from './client-interceptor/client-interceptor.component';
import { QuizmasterApiService } from './quizmaster-api-client/quizmaster-api-service.service';
import { HostWaitingRoomComponent } from './pages/host-waiting-room/host-waiting-room.component';
import { QuizComponent } from './pages/quiz/quiz.component';
import { JoinQuizComponent } from './pages/join-quiz/join-quiz.component';
import { HomeComponent } from './home/home.component';
import { JoinQuizService } from './pages/join-quiz/join-quiz.service';
import { WebsocketService } from './websocket/websocket.service';
import { PartyMemberService } from './party-member/party-member.service';
import { StartQuizComponent } from './pages/start-quiz/start-quiz.component';


@NgModule({
  imports: [
    BrowserAnimationsModule,
    FormsModule,
    HttpClientModule,
    ComponentsModule,
    NgbModule,
    RouterModule,
    AppRoutingModule,
    BrowserModule,
    HttpClientModule
  ],
  declarations: [
    AppComponent,
    AdminLayoutComponent,
    AuthLayoutComponent,
    ClientInterceptorComponent,
    JoinQuizComponent,
    HostWaitingRoomComponent,
    QuizComponent,
    HomeComponent,
    StartQuizComponent
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: ClientInterceptorComponent, multi: true },
    QuizmasterApiService,
    JoinQuizService,
    WebsocketService,
    PartyMemberService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
