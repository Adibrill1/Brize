import { getSetting, setSetting } from './db.js';

const STRINGS = {
  en: {
    budget: 'Budget',
    set_target: 'set target',
    connect_calendar: 'Connect Calendar',
    sync_calendar: 'Sync Calendar',
    syncing: 'Syncing…',
    export: 'Export',
    import: 'Import',
    settings_title: 'Settings',
    all: 'All',
    idea: 'Idea',
    planned: 'Planned',
    booked: 'Booked',
    done: 'Done',
    add_stop: 'Add a stop',
    new_stop: 'New stop',
    edit_stop: 'Edit stop',
    name: 'Name',
    name_ph: 'e.g. House sit near Lyon',
    type: 'Type',
    status: 'Status',
    stay: 'Stay',
    poi: 'Place / POI',
    parking: 'Parking',
    stay_type: 'Stay type',
    housesit: 'House sit',
    airbnb: 'Airbnb',
    camping: 'Camping',
    glamping: 'Glamping',
    friends: 'Friends',
    other: 'Other',
    cost_night: 'Cost / night (€)',
    arrival: 'Arrival',
    departure: 'Departure',
    parking_notes: 'Parking notes',
    parking_ph: 'Land Cruiser access, height limits…',
    notes: 'Notes',
    notes_ph: 'Links, contacts, anything',
    drag_pin: '(drag the pin to move)',
    delete: 'Delete',
    cancel: 'Cancel',
    save: 'Save',
    close: 'Close',
    draft_btn: '✨ Draft outreach message',
    drafting: '✨ Drafting…',
    draft_title: 'Outreach draft',
    draft_hint: 'Edit freely — this is a starting point, you send it yourself.',
    copy: 'Copy',
    copied: 'Copied!',
    language: 'Language / שפה',
    monthly_budget: 'Monthly stay budget target (€)',
    about_me: 'About me (used in outreach drafts — write in English)',
    api_key: 'Anthropic API key',
    api_key_saved_ph: 'A key is saved — leave empty to keep it',
    api_key_hint: 'Stored only on this device, sent only to api.anthropic.com.',
    unnamed: 'Unnamed stop',
    confirm_delete: 'Delete "{name}"?',
    this_stop: 'this stop',
    calendar_synced: 'Calendar synced — {c} created, {u} updated, {r} removed.',
    sync_failed: 'Calendar sync failed: {msg}',
    draft_failed: 'Draft failed: {msg}',
    import_done: 'Import done — {a} added, {u} updated, {s} unchanged.',
    import_failed: 'Import failed: {msg}',
    key_prompt: 'Paste your Anthropic API key (starts with "sk-ant-").\nIt is stored only on this device and sent only to api.anthropic.com.',
    search_ph: 'Search a place…',
    searching: 'Searching…',
    no_results: 'No places found',
    search_failed: 'Search failed: {msg}',
    find_stays: 'Find stays here',
    find_stays_title: 'Find stays near',
    find_stays_hint: 'Opens the official site in a new tab, filtered to this area and dates. You browse and copy candidates back — no scraping.',
    listing_url: 'Listing link',
    listing_ph: 'Paste an Airbnb / TrustedHousesitters link…',
    open_listing: 'Open listing ↗',
    source: 'Source',
    candidate: 'Candidate',
  },
  he: {
    budget: 'תקציב',
    set_target: 'הגדרת יעד',
    connect_calendar: 'חיבור יומן',
    sync_calendar: 'סנכרון יומן',
    syncing: 'מסנכרן…',
    export: 'ייצוא',
    import: 'ייבוא',
    settings_title: 'הגדרות',
    all: 'הכל',
    idea: 'רעיון',
    planned: 'מתוכנן',
    booked: 'הוזמן',
    done: 'בוצע',
    add_stop: 'הוספת עצירה',
    new_stop: 'עצירה חדשה',
    edit_stop: 'עריכת עצירה',
    name: 'שם',
    name_ph: 'למשל: House sit ליד ליון',
    type: 'סוג',
    status: 'סטטוס',
    stay: 'לינה',
    poi: 'מקום / נקודת עניין',
    parking: 'חניה',
    stay_type: 'סוג לינה',
    housesit: 'House sit',
    airbnb: 'Airbnb',
    camping: 'קמפינג',
    glamping: 'גלמפינג',
    friends: 'חברים',
    other: 'אחר',
    cost_night: 'עלות ללילה (€)',
    arrival: 'הגעה',
    departure: 'עזיבה',
    parking_notes: 'הערות חניה',
    parking_ph: 'גישה ללנד קרוזר, מגבלות גובה…',
    notes: 'הערות',
    notes_ph: 'קישורים, אנשי קשר, כל דבר',
    drag_pin: '(גררו את הסיכה כדי להזיז)',
    delete: 'מחיקה',
    cancel: 'ביטול',
    save: 'שמירה',
    close: 'סגירה',
    draft_btn: '✨ ניסוח פנייה למארח',
    drafting: '✨ מנסח…',
    draft_title: 'טיוטת פנייה',
    draft_hint: 'ערכו בחופשיות — זו נקודת פתיחה, השליחה בידיים שלכם.',
    copy: 'העתקה',
    copied: 'הועתק!',
    language: 'שפה / Language',
    monthly_budget: 'יעד תקציב לינה חודשי (€)',
    about_me: 'קצת עליי (לטיוטות פנייה — מומלץ באנגלית)',
    api_key: 'מפתח Anthropic API',
    api_key_saved_ph: 'מפתח שמור — השאירו ריק כדי לא לשנות',
    api_key_hint: 'נשמר רק במכשיר הזה ונשלח רק ל-api.anthropic.com.',
    unnamed: 'עצירה ללא שם',
    confirm_delete: 'למחוק את "{name}"?',
    this_stop: 'העצירה הזו',
    calendar_synced: 'היומן סונכרן — {c} נוצרו, {u} עודכנו, {r} הוסרו.',
    sync_failed: 'סנכרון היומן נכשל: {msg}',
    draft_failed: 'יצירת הטיוטה נכשלה: {msg}',
    import_done: 'הייבוא הושלם — {a} נוספו, {u} עודכנו, {s} ללא שינוי.',
    import_failed: 'הייבוא נכשל: {msg}',
    key_prompt: 'הדביקו כאן את מפתח ה-API של Anthropic (מתחיל ב-"sk-ant-").\nהמפתח נשמר רק במכשיר הזה ונשלח רק ל-api.anthropic.com.',
    search_ph: 'חיפוש מקום…',
    searching: 'מחפש…',
    no_results: 'לא נמצאו מקומות',
    search_failed: 'החיפוש נכשל: {msg}',
    find_stays: 'חיפוש לינה כאן',
    find_stays_title: 'חיפוש לינה ליד',
    find_stays_hint: 'נפתח האתר הרשמי בטאב חדש, מסונן לאזור ולתאריכים שלכם. אתם גולשים ומעתיקים מועמדות חזרה — בלי סריקה אוטומטית.',
    listing_url: 'קישור לליסטינג',
    listing_ph: 'הדביקו קישור מ-Airbnb / TrustedHousesitters…',
    open_listing: 'פתיחת הליסטינג ↗',
    source: 'מקור',
    candidate: 'מועמדת',
  },
};

let lang = 'en';

export function t(key, vars) {
  let s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  }
  return s;
}

export function currentLang() {
  return lang;
}

export async function initI18n() {
  lang = await getSetting('lang', 'en');
  apply();
}

export async function setLang(next) {
  if (next === lang) return;
  lang = next;
  await setSetting('lang', next);
  apply();
}

function apply() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  document.dispatchEvent(new CustomEvent('langchange'));
}
