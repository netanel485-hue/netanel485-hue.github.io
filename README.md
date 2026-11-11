# netanel485-hue.github.io

אתר הבית של המשפחה ב־GitHub Pages — מרכזי למידה לילדים ומדריכים.

## מה יש כאן

| פרויקט | מה זה | קישור חי |
| --- | --- | --- |
| מרכזי הלמידה | דף הבית — בחירת כיתה | https://netanel485-hue.github.io/ |
| כיתה א׳ | קריאה, אותיות ומשחקים | https://netanel485-hue.github.io/grade1-learning/ |
| כיתה ב׳ | מתמטיקה — שבילים פלוס 4 | https://netanel485-hue.github.io/grade2-math/ |
| כיתה ד׳ | מרכז הלמידה | https://netanel485-hue.github.io/grade4-learning/ |
| כיתה ו׳ | מרכז הלמידה | https://netanel485-hue.github.io/grade6-learning/ |
| מתמטיקה | מסלול השבוע למבחן — כיתה ו׳ | https://netanel485-hue.github.io/math-test-prep/ |
| חזרה למבדק | חזרה למבדק תחילת שנה — כיתה ד׳ | https://netanel485-hue.github.io/grade4-mivdak/ |
| משחק אנגלית | משחק אנגלית — אותיות ומילים | https://netanel485-hue.github.io/adi-english-game/ |
| מלכים א׳ | ערכת למידה — פרקים י״ז–כ״ב | https://netanel485-hue.github.io/dvir-melachim/ |
| מדריך Claude Code | מדריך בעברית — מתחילים בלי לדעת לתכנת | https://netanel485-hue.github.io/mdryk-claude-code.html |

## איך זה בנוי

- כל פרויקט הוא תיקייה משלו (או קובץ בודד, כמו מדריך Claude Code).
- **לא מזיזים תיקיות** — כל תיקייה היא כתובת חיה שמשותפת, והזזה תשבור את הקישור.
- עדכון של פרויקט = החלפת הקובץ או התיקייה שלו, בלי לגעת בשאר.
- `shared/site-bar.js` — סרגל "🏠 מרכזי הלמידה" משותף לכל הערכות שאין להן ניווט משלהן.
- עיצוב: בלוק `DESIGN-TOKENS` בכל קובץ מוצר הוא מקור האמת, ולא עורכים אותו בתוך הקובץ. שינויים ויזואליים נכנסים בבלוק נפרד עם id (`g1-fun`, `g4-fun`, `g6-fun`, `site-unify`, `hub-parent-viz`), כדי שאפשר יהיה להסיר אותם במחיקה אחת.
- `docs/ROADMAP.md` — מפת הדרכים ושכבות הגיל.
- כל שינוי ב-`index.html` של מרכז (כיתות ד׳ ו-ו׳) מחייב שם מטמון חדש ב-`sw.js` שלו.

## בדיקות
`tools/check.py` רץ אוטומטית בכל push ו-PR (GitHub Actions), ואפשר להריץ אותו גם מקומית: `python3 tools/check.py --base origin/main`. הוא בודק:
- תחביר JavaScript.
- `noindex` בכל דף, ושאין שמות ילדים בכותרות.
- תקינות שאלות: תשובה בטווח, בלי אפשרויות כפולות.
- קטעי קריאה והסברים מוצגים.
- התאמת מגדר בתבניות שאלות.
- שאין מספרים שליליים בהסברים לכיתה ד׳.
- שה-service worker תקין ושעדכנתם את שם המטמון.
