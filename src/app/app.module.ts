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
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { HostWaitingRoomComponent } from './pages/host-waiting-room/host-waiting-room.component';
import { QuizComponent } from './pages/quiz/quiz.component';
import { JoinQuizComponent } from './pages/join-quiz/join-quiz.component';
import { WaitingRoomComponent } from './pages/waiting-room/waiting-room.component';
import { HomeComponent } from './home/home.component';


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
    HttpClientModule,
    RouterModule.forRoot([
      { path: '', component: DashboardComponent },
      { path: 'joinQuiz', component: JoinQuizComponent }
      // { path: 'waitingRoom', component: WaitingRoomComponent },
      // { path: 'hostWaitingRoom', component: HostWaitingRoomComponent },
      // { path: 'quiz', component: QuizComponent },
    ])
  ],
  declarations: [
    AppComponent,
    AdminLayoutComponent,
    AuthLayoutComponent,
    ClientInterceptorComponent,
    JoinQuizComponent,
    WaitingRoomComponent,
    HostWaitingRoomComponent,
    QuizComponent,
    HomeComponent
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: ClientInterceptorComponent, multi: true },
    QuizmasterApiService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
