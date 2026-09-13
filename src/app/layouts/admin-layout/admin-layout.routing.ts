import { Routes } from '@angular/router';

import { DashboardComponent } from '../../pages/dashboard/dashboard.component';
import { JoinQuizComponent } from 'src/app/pages/join-quiz/join-quiz.component';
import { StartQuizComponent } from 'src/app/pages/start-quiz/start-quiz.component';
import { SinglePlayerComponent } from 'src/app/pages/single-player/single-player.component';

export const AdminLayoutRoutes: Routes = [
    { path: '',               component: DashboardComponent },
    { path: 'play/:token',    component: StartQuizComponent },
    { path: 'solo',           component: SinglePlayerComponent }
];
