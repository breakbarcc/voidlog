import type { Locale } from "@/i18n/locale";

/**
 * Privacy policy text for voidlog (separate from the breakbar.cc main site's,
 * which points here for this subdomain). German is the authoritative version;
 * the English one is a courtesy translation. Update `updated` and keep both
 * languages in sync when anything below changes — notably when the hosting,
 * the log parser (dps.report) or the stored data model changes.
 */

export interface PrivacySection {
  title: string;
  paragraphs?: string[];
  list?: string[];
}

export interface PrivacyContent {
  title: string;
  intro: string;
  updated: string;
  back: string;
  sections: PrivacySection[];
}

const de: PrivacyContent = {
  title: "Datenschutzerklärung",
  intro:
    "Diese Datenschutzerklärung gilt für voidlog (voidlog.breakbar.cc). Für die Hauptseite breakbar.cc und die übrigen Tools auf den Subdomains gelten deren eigene Datenschutzerklärungen.",
  updated: "Stand: Oktober 2026",
  back: "Zurück",
  sections: [
    {
      title: "1. Verantwortlicher",
      paragraphs: [
        "Verantwortlich im Sinne der DSGVO ist Patrick Schmidt, Fischenzstr. 39, Konstanz, E-Mail: info@breakbar.cc. Weitere Angaben finden sich im Impressum unter https://www.breakbar.cc/impressum.",
      ],
    },
    {
      title: "2. Worum es geht",
      paragraphs: [
        "voidlog ist ein Fanprojekt zum Hochladen, Auswerten und Vergleichen von Guild-Wars-2-Kampflogs (EVTC) in Projekten (z. B. Trainingsgruppen). Es ist kein offizielles Angebot von ArenaNet. Die Nutzung setzt eine Anmeldung über Discord voraus.",
      ],
    },
    {
      title: "3. Hosting und Server-Logdaten",
      paragraphs: [
        "voidlog läuft auf einem eigenen virtuellen Server (VPS), den ich bei der netcup GmbH, Emmy-Noether-Str. 10, 76131 Karlsruhe, miete. Beim Aufruf der Seite verarbeitet der Webserver automatisch technisch notwendige Verbindungsdaten (IP-Adresse, Datum und Uhrzeit, aufgerufene URL, übertragene Datenmenge, Browser/User-Agent, Referrer). Das ist zur Auslieferung der Seite und zur Abwehr von Missbrauch erforderlich (Art. 6 Abs. 1 lit. f DSGVO). Die Daten werden nur so lange gespeichert, wie es für Betrieb und Sicherheit erforderlich ist, und nicht mit anderen Daten zusammengeführt. Mit netcup besteht ein Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO).",
        "Die Domain breakbar.cc wird über Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA) verwaltet. Anfragen an voidlog werden über das Netzwerk von Cloudflare (Reverse-Proxy) geleitet; Cloudflare verarbeitet dabei technisch notwendige Verbindungsdaten (insbesondere die IP-Adresse) und leitet die Anfragen an meinen Server weiter.",
      ],
    },
    {
      title: "4. Anmeldung über Discord",
      paragraphs: [
        "Die Anmeldung erfolgt ausschließlich über „Mit Discord anmelden“ (OAuth2). Dabei werden Sie zu Discord weitergeleitet und melden sich dort an; Ihr Passwort erhalte ich nie. Ich frage die Berechtigungen „identify“ und „email“ ab und speichere:",
      ],
      list: [
        "Ihre Discord-Kennung, Ihren Anzeigenamen und Ihr Profilbild (Avatar-URL),",
        "Ihre bei Discord hinterlegte E-Mail-Adresse,",
        "die von Discord ausgestellten Zugriffs-Token (technisch erforderlich für die Anmeldung),",
        "das Datum der Registrierung sowie Ihre Mitgliedschaften und Rollen (Admin, Mitwirkender, Betrachter) in Projekten.",
      ],
    },
    {
      title: "5. Zweck und Rechtsgrundlage",
      paragraphs: [
        "Die Verarbeitung von Konto- und Projektdaten sowie der hochgeladenen Logs dient der Bereitstellung der Plattform (Art. 6 Abs. 1 lit. b DSGVO). Soweit in Logs Angaben zu Mitspielern enthalten sind, die selbst kein Konto haben (siehe Abschnitt 6), beruht die Verarbeitung auf meinem berechtigten Interesse, Spielergruppen eine Auswertung ihrer gemeinsamen Spielsitzungen zu ermöglichen (Art. 6 Abs. 1 lit. f DSGVO). Sicherheit und Missbrauchsabwehr stützen sich ebenfalls auf Art. 6 Abs. 1 lit. f DSGVO.",
      ],
    },
    {
      title: "6. Hochgeladene Kampflogs",
      paragraphs: [
        "Wenn Sie Logs hochladen, werden die Originaldateien (.evtc/.zevtc) in einem Objektspeicher abgelegt und aus ihnen Auswertungsdaten gewonnen, die in der Datenbank gespeichert werden. Ein Log enthält für alle Teilnehmenden des Kampfes unter anderem:",
      ],
      list: [
        "den Guild-Wars-2-Accountnamen (z. B. Name.1234) und den Charakternamen,",
        "Beruf, Gruppenzuordnung und ggf. Rolle,",
        "Schaden, Niederlagen/Tode, Mechanik-Ereignisse und Zeitpunkte des Kampfes.",
      ],
    },
    {
      title: "7. Weitergabe an dps.report",
      paragraphs: [
        "Zur Auswertung wird jede hochgeladene Log-Datei an den Dienst dps.report (https://dps.report) übermittelt, der das Log mit Elite Insights verarbeitet und die Auswertung zurückgibt. Dabei entsteht dort ein Bericht mit einem Link, der für jeden zugänglich ist, der den Link kennt. Dieser Link wird in voidlog gespeichert und kann dort von Projektmitgliedern geöffnet werden. Auf Speicherdauer und Löschung auf dps.report habe ich keinen Einfluss; Löschanfragen sind dort zu stellen. Es gelten die Datenschutzhinweise von dps.report.",
      ],
    },
    {
      title: "8. Object Storage bei Cloudflare R2",
      paragraphs: [
        "Die Original-Logdateien werden in einem Objektspeicher (Cloudflare R2) der Cloudflare, Inc., USA, gespeichert. Beim Hochladen überträgt Ihr Browser die Datei direkt dorthin; Cloudflare erhält dabei technisch notwendige Verbindungsdaten wie die IP-Adresse. Der Zugriff auf die Dateien ist nicht öffentlich. Für Übermittlungen in die USA stützt sich Cloudflare auf das EU-US Data Privacy Framework und Standardvertragsklauseln.",
      ],
    },
    {
      title: "9. Sichtbarkeit innerhalb von Projekten",
      paragraphs: [
        "Logs und Auswertungen sind für alle Mitglieder des jeweiligen Projekts sichtbar, nicht für Außenstehende. Projektmitglieder sehen dabei auch Ihren Anzeigenamen als Uploader und die in den Logs enthaltenen Spielerdaten. Der Zugang erfolgt über Einladungslinks, die von Projekt-Admins erzeugt werden; in der Datenbank wird nur ein Hash des Einladungs-Tokens gespeichert.",
      ],
    },
    {
      title: "10. Cookies und lokale Speicherung",
      paragraphs: [
        "voidlog setzt keine Tracking- oder Analyse-Cookies und bindet keine Werbe- oder Analysedienste ein. Es werden nur technisch notwendige Cookies verwendet, für die keine Einwilligung erforderlich ist (§ 25 Abs. 2 Nr. 2 TDDDG):",
      ],
      list: [
        "Sitzungs-Cookie der Anmeldung (authjs.session-token, im Produktivbetrieb mit Präfix __Secure-) – hält Sie angemeldet; die Sitzung wird serverseitig in der Datenbank geführt und läuft automatisch ab.",
        "Sicherheits-Cookies der Anmeldung (authjs.csrf-token, authjs.callback-url, mit Präfix __Host- bzw. __Secure-) – Schutz vor Fälschungen und Rücksprung nach der Anmeldung.",
        "Spracheinstellung (breakbar-language) – speichert Deutsch/Englisch, ein Jahr gültig, wird mit der Hauptseite und den anderen Subdomains von breakbar.cc geteilt.",
      ],
    },
    {
      title: "11. Schriftarten",
      paragraphs: [
        "Die verwendeten Schriftarten (Inter, Chakra Petch) werden von meinem eigenen Server ausgeliefert. Beim Aufruf der Seite wird keine Verbindung zu Google-Servern aufgebaut.",
      ],
    },
    {
      title: "12. Speicherdauer und Löschung",
      paragraphs: [
        "Ihre Daten bleiben gespeichert, solange Ihr Konto besteht bzw. das Projekt existiert. Sie können unter „Konto“ jederzeit selbst:",
      ],
      list: [
        "alle von Ihnen hochgeladenen Logs löschen (inklusive der Originaldateien im Objektspeicher),",
        "Ihr Konto vollständig löschen. Projekte, in denen Sie der einzige Admin sind, werden dabei mit allen Daten gelöscht; bei Projekten mit weiteren Admins geht die Inhaberschaft an einen von diesen über. Von Ihnen hochgeladene Logs in weiterbestehenden Projekten bleiben dort erhalten, werden aber keinem Konto mehr zugeordnet.",
      ],
    },
    {
      title: "13. Ihre Rechte",
      paragraphs: [
        "Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21 DSGVO). Eine erteilte Einwilligung können Sie jederzeit widerrufen. Wenden Sie sich dazu an info@breakbar.cc.",
        "Außerdem haben Sie das Recht auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde, z. B. beim Landesbeauftragten für den Datenschutz und die Informationsfreiheit Baden-Württemberg, Lautenschlagerstraße 20, 70173 Stuttgart.",
      ],
    },
    {
      title: "14. Erforderlichkeit der Angaben",
      paragraphs: [
        "Ohne die genannten Konto- und Verbindungsdaten ist eine Nutzung von voidlog nicht möglich. Eine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne von Art. 22 DSGVO findet nicht statt.",
      ],
    },
    {
      title: "15. Änderungen",
      paragraphs: [
        "Ich passe diese Erklärung an, wenn sich die Plattform oder die Rechtslage ändert. Es gilt die jeweils hier veröffentlichte Fassung.",
      ],
    },
  ],
};

const en: PrivacyContent = {
  title: "Privacy Policy",
  intro:
    "This privacy policy applies to voidlog (voidlog.breakbar.cc). The main site breakbar.cc and the other tools on its subdomains have their own privacy policies. The German version is authoritative; this English text is a courtesy translation.",
  updated: "Last updated: October 2026",
  back: "Back",
  sections: [
    {
      title: "1. Controller",
      paragraphs: [
        "The controller within the meaning of the GDPR is Patrick Schmidt, Fischenzstr. 39, Konstanz, Germany, e-mail: info@breakbar.cc. Further details are in the legal notice at https://www.breakbar.cc/impressum.",
      ],
    },
    {
      title: "2. What this is",
      paragraphs: [
        "voidlog is a fan project for uploading, analysing and comparing Guild Wars 2 combat logs (EVTC) within projects (e.g. training groups). It is not an official ArenaNet service. Using it requires signing in with Discord.",
      ],
    },
    {
      title: "3. Hosting and server logs",
      paragraphs: [
        "voidlog runs on a virtual private server (VPS) that I rent from netcup GmbH, Emmy-Noether-Str. 10, 76131 Karlsruhe, Germany. When you visit the site, the web server automatically processes technically necessary connection data (IP address, date and time, requested URL, amount of data transferred, browser/user agent, referrer). This is required to deliver the site and to prevent abuse (Art. 6(1)(f) GDPR). The data is kept only as long as needed for operation and security and is not combined with other data. A data processing agreement (Art. 28 GDPR) is in place with netcup.",
        "The domain breakbar.cc is managed through Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA). Requests to voidlog are routed through Cloudflare's network (reverse proxy); Cloudflare processes technically necessary connection data (in particular the IP address) and forwards the requests to my server.",
      ],
    },
    {
      title: "4. Sign-in with Discord",
      paragraphs: [
        "Sign-in is exclusively via “Sign in with Discord” (OAuth2). You are redirected to Discord and authenticate there; I never receive your password. I request the “identify” and “email” scopes and store:",
      ],
      list: [
        "your Discord ID, display name and profile picture (avatar URL),",
        "the e-mail address stored with Discord,",
        "the access tokens issued by Discord (technically required for sign-in),",
        "your registration date and your memberships and roles (admin, contributor, viewer) in projects.",
      ],
    },
    {
      title: "5. Purpose and legal basis",
      paragraphs: [
        "Account and project data and uploaded logs are processed to provide the platform (Art. 6(1)(b) GDPR). Where logs contain data about other players who have no account themselves (see section 6), processing is based on my legitimate interest in letting player groups analyse their shared sessions (Art. 6(1)(f) GDPR). Security and abuse prevention likewise rely on Art. 6(1)(f) GDPR.",
      ],
    },
    {
      title: "6. Uploaded combat logs",
      paragraphs: [
        "When you upload logs, the original files (.evtc/.zevtc) are stored in object storage and analysis data derived from them is stored in the database. A log contains, for every participant of the fight, among other things:",
      ],
      list: [
        "the Guild Wars 2 account name (e.g. Name.1234) and character name,",
        "profession, squad group and possibly role,",
        "damage, downs/deaths, mechanic events and their timing.",
      ],
    },
    {
      title: "7. Transfer to dps.report",
      paragraphs: [
        "For analysis, every uploaded log file is sent to the service dps.report (https://dps.report), which processes the log with Elite Insights and returns the result. This creates a report there with a link that is accessible to anyone who knows it. The link is stored in voidlog and can be opened by project members. I have no influence on retention or deletion at dps.report; deletion requests must be directed to them. dps.report's own privacy information applies.",
      ],
    },
    {
      title: "8. Object storage at Cloudflare R2",
      paragraphs: [
        "The original log files are stored in object storage (Cloudflare R2) operated by Cloudflare, Inc., USA. When uploading, your browser sends the file directly there; Cloudflare receives technically necessary connection data such as the IP address. The files are not publicly accessible. For transfers to the USA, Cloudflare relies on the EU-US Data Privacy Framework and standard contractual clauses.",
      ],
    },
    {
      title: "9. Visibility within projects",
      paragraphs: [
        "Logs and analyses are visible to all members of the respective project, not to outsiders. Project members also see your display name as the uploader and the player data contained in the logs. Access is granted through invite links created by project admins; only a hash of the invite token is stored in the database.",
      ],
    },
    {
      title: "10. Cookies and local storage",
      paragraphs: [
        "voidlog uses no tracking or analytics cookies and embeds no advertising or analytics services. Only strictly necessary cookies are used, which require no consent (§ 25(2) no. 2 TDDDG):",
      ],
      list: [
        "Sign-in session cookie (authjs.session-token, prefixed __Secure- in production) – keeps you signed in; the session is kept server-side in the database and expires automatically.",
        "Sign-in security cookies (authjs.csrf-token, authjs.callback-url, prefixed __Host- / __Secure-) – forgery protection and return to the page after signing in.",
        "Language setting (breakbar-language) – stores German/English, valid for one year, shared with the main site and the other breakbar.cc subdomains.",
      ],
    },
    {
      title: "11. Fonts",
      paragraphs: [
        "The fonts used (Inter, Chakra Petch) are served from my own server. No connection to Google servers is made when you visit the site.",
      ],
    },
    {
      title: "12. Retention and deletion",
      paragraphs: [
        "Your data remains stored as long as your account or the project exists. Under “Account” you can at any time yourself:",
      ],
      list: [
        "delete all logs you uploaded (including the original files in object storage),",
        "delete your account entirely. Projects of which you are the only admin are deleted with all their data; for projects with other admins, ownership passes to one of them. Logs you uploaded to projects that continue remain there but are no longer linked to an account.",
      ],
    },
    {
      title: "13. Your rights",
      paragraphs: [
        "You have the right of access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and to object to processing based on legitimate interests (Art. 21 GDPR). Consent you have given can be withdrawn at any time. Please contact info@breakbar.cc.",
        "You also have the right to lodge a complaint with a supervisory authority, e.g. the State Commissioner for Data Protection and Freedom of Information of Baden-Württemberg, Lautenschlagerstraße 20, 70173 Stuttgart, Germany.",
      ],
    },
    {
      title: "14. Necessity of data and automated decisions",
      paragraphs: [
        "voidlog cannot be used without the account and connection data described above. There is no automated decision-making, including profiling, within the meaning of Art. 22 GDPR.",
      ],
    },
    {
      title: "15. Changes",
      paragraphs: [
        "I will update this policy when the platform or the legal situation changes. The version published here applies.",
      ],
    },
  ],
};

export const PRIVACY: Record<Locale, PrivacyContent> = { de, en };
