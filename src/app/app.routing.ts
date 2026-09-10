import { NgModule } from '@angular/core';
import { CommonModule, } from '@angular/common';
import { BrowserModule  } from '@angular/platform-browser';
import { Routes, RouterModule } from '@angular/router';

import { AdminLayoutComponent } from './layouts/admin-layout/admin-layout.component';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component';
import { JoinQuizComponent } from './pages/join-quiz/join-quiz.component';
import { StartQuizComponent } from './pages/start-quiz/start-quiz.component';

const routes: Routes =[
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      {
        path: '',
        loadChildren: () => import('./layouts/admin-layout/admin-layout.module').then(m => m.AdminLayoutModule)
      }
    ]
  }, {
    path: '',
    component: AuthLayoutComponent,
    children: [
      {
        path: '',
        loadChildren: () => import('./layouts/auth-layout/auth-layout.module').then(m => m.AuthLayoutModule)
      }
    ]
  }, {
    path: '**',
    redirectTo: ''
  },
  // {
  //   path: 'startQuiz',
  //   component: StartQuizComponent
  // }
];

@NgModule({
  imports: [
    CommonModule,
    BrowserModule,
    // scrollPositionRestoration: 'top' - jump to the top of the page on
    // every forward navigation (dashboard -> quiz lobby countdown ->
    // start-quiz, "Back to dashboard", etc.), so a user who'd scrolled
    // down (e.g. to reach the Join/Host cards on mobile) doesn't land
    // mid-page on the next screen. Back/forward browser navigation still
    // restores the scroll position it had, which is Angular's default
    // pairing for this option.
    RouterModule.forRoot(routes, { scrollPositionRestoration: 'top', relativeLinkResolution: 'legacy' })
  ],
  exports: [
  ],
})
export class AppRoutingModule { }
