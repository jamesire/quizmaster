import { Answer } from "./Answer";

export interface Question {
    category: string;
    type: string;
    difficulty: string;
    question: string;
    correctAnswer: string;
    incorrectAnswers: string[];
    allAnswers: Answer[];
}