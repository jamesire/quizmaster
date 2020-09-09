import { Answer } from "./Answer";
import { Question } from "./Question";

export class QuestionHelper {
    static setAnswerChoices(questions) {
        let possibleAnswers: Answer[];

        if(!Array.isArray(questions)) {
            questions = [ questions ];
        }

        questions.map(question => {
            possibleAnswers = [];
            question.incorrectAnswers.forEach(answer => {
                possibleAnswers.push({text: answer, isCorrect: false})
            })
        
            possibleAnswers.push({text: question.correctAnswer, isCorrect: true});
        
            // shuffle answers
            if(possibleAnswers.length > 2) {
            for (let i = possibleAnswers.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [possibleAnswers[i], possibleAnswers[j]] = [possibleAnswers[j], possibleAnswers[i]];
            }
            }
            else if(possibleAnswers[0].text === "False") {
                [possibleAnswers[0], possibleAnswers[1]] = [possibleAnswers[1], possibleAnswers[0]];
            }

            question.allAnswers = possibleAnswers;
        });
        
        return questions;
      }
}