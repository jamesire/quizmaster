import { Injectable } from '@angular/core';
import { QuizmasterApiService } from './quizmaster-api-service.service';
import { QuestionHelper } from 'src/app/models/QuestionHelper';
import { Question } from 'src/app/models/Question';

const STORAGE_KEY = 'quizmaster.dashboardTriviaCache';
const BATCH_SIZE = 5;
const LOW_WATERMARK = 2;

// Raw shape returned by QuizmasterApiService.getRandomQuestions(), before
// QuestionHelper.setAnswerChoices() adds allAnswers/shuffles them.
interface RawQuestion {
  category: string;
  type: string;
  difficulty: string;
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
}

interface CachedState {
  // Already processed (allAnswers assigned, shuffled) - persisted as-is
  // so a refresh shows the exact same question in the exact same answer
  // order, not just the same question text re-shuffled.
  current: Question;
  // Not yet shown - raw, processed only once they become `current`.
  queue: RawQuestion[];
}

// Backs the dashboard's "Random Trivia" preview tile. Fetches 5 questions
// at a time instead of 1 (Open Trivia DB rate-limits to ~1 request per 5
// seconds per IP, and this tile used to make one request per question),
// and persists the current question + remaining queue to localStorage so
// a refresh (or just navigating away and back) keeps showing the same
// unanswered question instead of fetching - and counting against the
// rate limit for - a brand new one.
@Injectable({
  providedIn: 'root'
})
export class TriviaPreviewService {
  private topUpInFlight: Promise<void> = null;

  constructor(private api: QuizmasterApiService) { }

  async getCurrentQuestion(): Promise<Question> {
    const state = this.readState();

    if (state && state.current) {
      this.maybeTopUp(state.queue);
      return state.current;
    }

    const batch = await this.api.getRandomQuestions(BATCH_SIZE);
    return this.setCurrentFromQueue(batch);
  }

  // Called once the current question has actually been answered - moves
  // to the next queued question (fetching a fresh batch first if none are
  // queued yet) and returns it.
  async advance(): Promise<Question> {
    const state = this.readState();
    const queue = state ? state.queue : [];

    if (queue.length === 0) {
      const batch = await this.api.getRandomQuestions(BATCH_SIZE);
      return this.setCurrentFromQueue(batch);
    }

    return this.setCurrentFromQueue(queue);
  }

  private setCurrentFromQueue(queue: RawQuestion[]): Question {
    const [next, ...rest] = queue;
    const current = QuestionHelper.setAnswerChoices(next)[0];
    this.writeState({ current, queue: rest });
    this.maybeTopUp(rest);
    return current;
  }

  private maybeTopUp(queue: RawQuestion[]) {
    if (queue.length >= LOW_WATERMARK || this.topUpInFlight) {
      return;
    }

    this.topUpInFlight = this.topUp();
  }

  private async topUp(): Promise<void> {
    try {
      const fresh = await this.api.getRandomQuestions(BATCH_SIZE);
      // Re-read rather than reuse whatever queue triggered this - the
      // current question (and what's left of the queue) may have moved
      // on while this fetch was in flight.
      const state = this.readState();
      if (state) {
        this.writeState({ current: state.current, queue: [...state.queue, ...fresh] });
      }
    } catch (err) {
      console.error('Could not top up the trivia question queue: ' + err);
    } finally {
      this.topUpInFlight = null;
    }
  }

  private readState(): CachedState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      // Private browsing / storage disabled - just means no persistence
      // across a refresh, not a reason to break the tile.
      return null;
    }
  }

  private writeState(state: CachedState) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Same as above - fail quietly.
    }
  }
}
