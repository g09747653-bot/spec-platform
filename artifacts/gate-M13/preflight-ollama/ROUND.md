# JSON-раунд на кандидате гейтовой модели (профиль скорости, 2026-08-16)

Модель `qwen3:8b` у провайдера `ollama`, окно 16384. Через настоящего агента, то есть вместе
со слоями Р-1: терпимый разбор, детерминированный ремонт, один пересэмпл.

| прогон | вызовов модели | исход | вопросов | ремонт | секунд | претензии |
|---|---|---|---|---|---|---|
| round-1 | 1 | **round** | 5 | нет | 27.7 | — |
| round-2 | 1 | **round** | 5 | нет | 21.8 | — |
| round-3 | 1 | **round** | 5 | нет | 25.7 | — |

Столбец «ремонт» — сработал ли детерминированный ремонт набора (лишние рекомендации, размеры
списков). «да» здесь не отказ: черновик был пригоден после ремонта, и ремонт оставляет строку
в логе (задача 131).

## Режим «Concrete»: те же прогоны под скриптованной рубрикой (задача 144, §4)

Стадия `solution`, профиль `non-technical`, `style: concrete` — стиль обязан вытеснить регистр
профиля, а не сложиться с ним. Рубрика считается по **сырому** черновику: то, что схема
молча отбрасывает (выдуманная ссылка, чужой слаг), обязано быть названо.

Зелено = ноль **блокирующих** находок. «сов.» — совещательные: их читают, по ним не блокируют.

| прогон | вызовов | исход | вопросов | second-person | forbidden-vocabulary | question-shape | spravka-asymmetry | секунд |
|---|---|---|---|---|---|---|---|---|
| concrete-1 | 1 | **round** | 4 | **7 блок.** · 1 сов. | **2 блок.** | 5 сов. | **23 блок.** · 12 сов. | 37.3 |
| concrete-2 | 1 | **round** | 5 | ✓ | ✓ | 5 сов. | **1 блок.** · 4 сов. | 20.2 |
| concrete-3 | 1 | **round** | 5 | **2 блок.** | **1 блок.** | 6 сов. | 10 сов. | 22.1 |

### Находки построчно

- **concrete-1** · `rubric-first-person-voice-q1-o4-note` (blocking) — “us” speaks in the first person. Every option is something the interviewer says to the person, never something the person says back, so no label, description or note is written as theirs. Найдено: «Let us choose based on your needs».
- **concrete-1** · `rubric-first-person-voice-q2-o4-note` (blocking) — “us” speaks in the first person. Every option is something the interviewer says to the person, never something the person says back, so no label, description or note is written as theirs. Найдено: «Let us choose based on your needs».
- **concrete-1** · `rubric-first-person-voice-q3-o4-note` (blocking) — “us” speaks in the first person. Every option is something the interviewer says to the person, never something the person says back, so no label, description or note is written as theirs. Найдено: «Let us choose based on your needs».
- **concrete-1** · `rubric-first-person-voice-q4-o4-note` (blocking) — “us” speaks in the first person. Every option is something the interviewer says to the person, never something the person says back, so no label, description or note is written as theirs. Найдено: «Let us choose based on your needs».
- **concrete-1** · `rubric-second-person-coverage` (advisory) — Fewer than half the option descriptions address the person. The voice is holding in the questions and falling away in the options, which is where it usually goes first. Найдено: «1 of 16 descriptions».
- **concrete-1** · `rubric-second-person-question-q2-text` (blocking) — The question never addresses the person it is asking. A concrete round asks what they want built and how they will use it, so every question names them directly. Найдено: «How will the grant data be stored?».
- **concrete-1** · `rubric-second-person-question-q3-text` (blocking) — The question never addresses the person it is asking. A concrete round asks what they want built and how they will use it, so every question names them directly. Найдено: «Will the tool automatically draft emails or require manual input?».
- **concrete-1** · `rubric-second-person-question-q4-text` (blocking) — The question never addresses the person it is asking. A concrete round asks what they want built and how they will use it, so every question names them directly. Найдено: «How often will users check the tool for reminders?».
- **concrete-1** · `rubric-hedge-option-q3-o3-label` (blocking) — The option declines to be a choice. Every option must be something that can be chosen and then done — a named technology, a mechanism, a limit, an order of work. Найдено: «Both».
- **concrete-1** · `rubric-persona-and-feeling-q3-o1-description` (blocking) — “personalization” asks about a feeling or invents someone to ask through. Ask about use as observable behaviour instead — what they run first, how often they come back, what they do the day it breaks. Найдено: «Generate emails with placeholders for personalization».
- **concrete-1** · `rubric-decision-opener-q1-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «What technology will you use for the frontend?».
- **concrete-1** · `rubric-decision-opener-q2-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «How will the grant data be stored?».
- **concrete-1** · `rubric-decision-opener-q3-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «Will the tool automatically draft emails or require manual input?».
- **concrete-1** · `rubric-decision-opener-q4-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «How often will users check the tool for reminders?».
- **concrete-1** · `rubric-recommended-everywhere` (advisory) — Every question in the round carries a recommendation, which is the interviewer answering the whole round on the person’s behalf. Найдено: «4 of 4 questions».
- **concrete-1** · `rubric-decorated-escape-q1-o4` (blocking) — An option that names no technology carries a note, a link or a logo. The refusal and the bring-your-own answers stay bare — they are the guaranteed plain case in an otherwise technological question. Найдено: «No preference».
- **concrete-1** · `rubric-decorated-escape-q2-o4` (blocking) — An option that names no technology carries a note, a link or a logo. The refusal and the bring-your-own answers stay bare — they are the guaranteed plain case in an otherwise technological question. Найдено: «No preference».
- **concrete-1** · `rubric-decorated-escape-q3-o4` (blocking) — An option that names no technology carries a note, a link or a logo. The refusal and the bring-your-own answers stay bare — they are the guaranteed plain case in an otherwise technological question. Найдено: «No preference».
- **concrete-1** · `rubric-decorated-escape-q4-o4` (blocking) — An option that names no technology carries a note, a link or a logo. The refusal and the bring-your-own answers stay bare — they are the guaranteed plain case in an otherwise technological question. Найдено: «No preference».
- **concrete-1** · `rubric-empty-extras-q1-o3-href` (blocking) — “href” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ. Найдено: «""».
- **concrete-1** · `rubric-empty-extras-q1-o4-href` (blocking) — “href” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ. Найдено: «""».
- **concrete-1** · `rubric-empty-extras-q2-o1-href` (blocking) — “href” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ. Найдено: «""».
- **concrete-1** · `rubric-empty-extras-q2-o2-href` (blocking) — “href” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ. Найдено: «""».
- **concrete-1** · `rubric-empty-extras-q2-o3-href` (blocking) — “href” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ. Найдено: «""».
- **concrete-1** · `rubric-empty-extras-q2-o4-href` (blocking) — “href” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ. Найдено: «""».
- **concrete-1** · `rubric-empty-extras-q3-o1-href` (blocking) — “href” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ. Найдено: «""».
- **concrete-1** · `rubric-empty-extras-q3-o2-href` (blocking) — “href” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ. Найдено: «""».
- **concrete-1** · `rubric-empty-extras-q3-o3-href` (blocking) — “href” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ. Найдено: «""».
- **concrete-1** · `rubric-empty-extras-q3-o4-href` (blocking) — “href” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ. Найдено: «""».
- **concrete-1** · `rubric-empty-extras-q4-o1-href` (blocking) — “href” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ. Найдено: «""».
- **concrete-1** · `rubric-empty-extras-q4-o2-href` (blocking) — “href” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ. Найдено: «""».
- **concrete-1** · `rubric-empty-extras-q4-o3-href` (blocking) — “href” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ. Найдено: «""».
- **concrete-1** · `rubric-empty-extras-q4-o4-href` (blocking) — “href” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ. Найдено: «""».
- **concrete-1** · `rubric-foreign-host-q1-o2-href` (blocking) — The logo says react and the link goes to vuejs.org. A slug is its own allow-list, so an address on another host is a guess rather than an address. Найдено: «https://vuejs.org».
- **concrete-1** · `rubric-note-repeats-description-q2-o1-note` (advisory) — The note repeats the description. The description says what choosing this option means here; the note says what the technology is in the world. Найдено: «Data remains on the user’s device».
- **concrete-1** · `rubric-note-too-short-q1-o4-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Let us choose based on your needs».
- **concrete-1** · `rubric-note-too-short-q2-o1-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Data remains on the user’s device».
- **concrete-1** · `rubric-note-too-short-q2-o2-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Data is stored in a cloud database».
- **concrete-1** · `rubric-note-too-short-q2-o3-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Data is hosted on your own servers».
- **concrete-1** · `rubric-note-too-short-q2-o4-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Let us choose based on your needs».
- **concrete-1** · `rubric-note-too-short-q3-o2-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Emails are written manually by the user».
- **concrete-1** · `rubric-note-too-short-q3-o4-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Let us choose based on your needs».
- **concrete-1** · `rubric-note-too-short-q4-o1-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Daily check for due dates».
- **concrete-1** · `rubric-note-too-short-q4-o2-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Weekly review of due dates».
- **concrete-1** · `rubric-note-too-short-q4-o3-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Manual checks for due dates».
- **concrete-1** · `rubric-note-too-short-q4-o4-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Let us choose based on your needs».
- **concrete-1** · `rubric-uniform-decoration-q1` (blocking) — Every option in the question carries a note, so either the option that declines is missing or it has been decorated too. A question whose first option names a tool and whose other three do not shows exactly one note, and that is correct. Найдено: «4 of 4 options».
- **concrete-1** · `rubric-uniform-decoration-q2` (blocking) — Every option in the question carries a note, so either the option that declines is missing or it has been decorated too. A question whose first option names a tool and whose other three do not shows exactly one note, and that is correct. Найдено: «4 of 4 options».
- **concrete-1** · `rubric-uniform-decoration-q3` (blocking) — Every option in the question carries a note, so either the option that declines is missing or it has been decorated too. A question whose first option names a tool and whose other three do not shows exactly one note, and that is correct. Найдено: «4 of 4 options».
- **concrete-1** · `rubric-uniform-decoration-q4` (blocking) — Every option in the question carries a note, so either the option that declines is missing or it has been decorated too. A question whose first option names a tool and whose other three do not shows exactly one note, and that is correct. Найдено: «4 of 4 options».
- **concrete-2** · `rubric-decision-opener-q1-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «You will use this tool on your phone, laptop, or both?».
- **concrete-2** · `rubric-decision-opener-q2-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «You need this tool to work with anything you already use?».
- **concrete-2** · `rubric-decision-opener-q3-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «How many of you will use this tool, and will that change quickly?».
- **concrete-2** · `rubric-decision-opener-q4-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «You need anything to keep working without a connection?».
- **concrete-2** · `rubric-decision-opener-q5-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «You use anything that this tool has to fit alongside?».
- **concrete-2** · `rubric-note-too-short-q1-o3-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Requires sync between platforms».
- **concrete-2** · `rubric-note-too-short-q4-o11-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Requires device-based data storage».
- **concrete-2** · `rubric-note-too-short-q5-o14-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Requires export/import capabilities».
- **concrete-2** · `rubric-note-too-short-q5-o15-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Requires API access to that tool».
- **concrete-2** · `rubric-uniform-decoration-q1` (blocking) — Every option in the question carries a note, so either the option that declines is missing or it has been decorated too. A question whose first option names a tool and whose other three do not shows exactly one note, and that is correct. Найдено: «3 of 3 options».
- **concrete-3** · `rubric-second-person-question-q4-text` (blocking) — The question never addresses the person it is asking. A concrete round asks what they want built and how they will use it, so every question names them directly. Найдено: «Does anything need to keep working without a connection?».
- **concrete-3** · `rubric-second-person-question-q5-text` (blocking) — The question never addresses the person it is asking. A concrete round asks what they want built and how they will use it, so every question names them directly. Найдено: «What existing tools will this fit alongside?».
- **concrete-3** · `rubric-hedge-option-q1-p3-label` (blocking) — The option declines to be a choice. Every option must be something that can be chosen and then done — a named technology, a mechanism, a limit, an order of work. Найдено: «Both».
- **concrete-3** · `rubric-decision-opener-q1-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «You will use this tool on phone, laptop, or both?».
- **concrete-3** · `rubric-decision-opener-q2-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «Does this tool need to work with anything you already use?».
- **concrete-3** · `rubric-decision-opener-q3-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «How many of you will use this tool, and will that number change quickly?».
- **concrete-3** · `rubric-decision-opener-q4-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «Does anything need to keep working without a connection?».
- **concrete-3** · `rubric-decision-opener-q5-text` (advisory) — The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it. Найдено: «What existing tools will this fit alongside?».
- **concrete-3** · `rubric-need-shape-q5-1` (advisory) — An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs. Найдено: «existing_tools».
- **concrete-3** · `rubric-note-too-short-q1-p2-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Requires a browser-based interface.».
- **concrete-3** · `rubric-note-too-short-q2-c2-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Requires calendar API access.».
- **concrete-3** · `rubric-note-too-short-q2-c3-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Requires API for task synchronization.».
- **concrete-3** · `rubric-note-too-short-q3-u1-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Requires minimal user permissions.».
- **concrete-3** · `rubric-note-too-short-q3-u2-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Requires scalable access controls.».
- **concrete-3** · `rubric-note-too-short-q4-o2-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «No offline functionality required.».
- **concrete-3** · `rubric-note-too-short-q5-t1-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Requires email API or SMTP access.».
- **concrete-3** · `rubric-note-too-short-q5-t2-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Requires calendar API access.».
- **concrete-3** · `rubric-note-too-short-q5-t3-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Requires API for task synchronization.».
- **concrete-3** · `rubric-note-too-short-q5-t4-note` (advisory) — The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to. Найдено: «Standalone deployment required.».

### Чего рубрика не решает

Зелёная таблица выше не означает, что проверено всё: ниже — то, что текстом не решается и
остаётся судейскому проходу гейта 146.

- **whether a question should be `single` or `multiple`** — Semantics rather than text: «retry · quarantine · log · exit non-zero» add up, «in a terminal · on a schedule» exclude each other, and no reading of the words separates the two. It stays with the judge pass of gate 146.
- **whether an option carrying a note actually names a technology** — A label names a technology when it has a home page of its own, which is a fact about the world. The decidable neighbours are checked: an escape option carrying a note (`decorated-escape`), a question where every option carries one (`uniform-decoration`), a slug outside the closed set, and a link off the vendor’s own host.