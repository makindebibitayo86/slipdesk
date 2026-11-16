# Slip Desk

A browser-based desk tool for the **Oyo State 2026 Compulsory Examination**. Staff sign in, load the candidate register from an Excel file, look up a candidate, check payment status, and print the Registration Slip or Exam Slip.

No server, build step, or install is needed. Everything runs in the browser.

## Features

- **Account menu and Profile page**: the sign-in pill in the navbar opens a menu (Profile / Sign out). On the Profile page each officer can edit their own name, job title, phone, email and photo with a live preview, change their password, and export or import their profile for another computer. Everything is kept on that computer only
- **Staff sign-in** with per-user accounts, forced password change on first use, lockout after repeated wrong attempts, and auto-lock after 5 minutes idle
- **Load register** from an Excel file (browse or drag and drop, with progress and replace confirmation)
- **Candidate search** by name, payment reference, exam number, or phone number
- **Registration Slip** and **Exam Slip** (the Exam Slip stays locked until payment is confirmed)
- **Analysis** page for register breakdowns
- **Activity Log** that records actions under each officer's name
- **Idle "notch"**: the tab bar folds into a countdown / clock / weather pill
- **Legal pages**: Disclaimer, Privacy & data protection, Terms of use

## Quick start

1. Download or clone this repository (keep all folders together).
2. Open `slip-desk.html` in a browser (double-click is enough).

> Internet is needed for the Excel reader library (SheetJS), Google Fonts, and the weather slide (open-meteo.com). Without internet, the weather slide is skipped.

## Project structure

```
slip-desk.html        Main page (tabs, loader, layout)
css/                  Stylesheets, loaded in numbered order
js/
  app.js              Shell, log recording, Excel loader, footer
  gate.js             Accounts, sign-in, idle auto-lock, saved profiles, password change
  profile.js          Account menu (Profile / Sign out) and the Profile page
  upload-panel.js     "Load register" panel (browse, drag and drop, progress)
  nav-notch.js        Idle notch (tab bar -> countdown / clock / weather)
  sync.js             Small helper (dims page when a navbar dropdown is open)
pages/                One file per page: Registration, Exam, Analysis, Log, Legal, Print
assets/               Crest, sign-in backgrounds, staff avatars
assets/icons/         Favicons and app icons
```

The pages are `.js` files rather than `.html` on purpose. Browsers block separate HTML pages from talking to each other when opened by double-click (`file://`), and this layout avoids that.

## Configuration

| What | Where |
| --- | --- |
| Staff accounts and password hashes | `js/gate.js` (`USERS`) |
| Weather place and coordinates | `js/gate.js` (`WX`) |
| Help-desk contact (WhatsApp, email, social links) | `js/app.js` (contact block) |

### Issuing a temporary password

Passwords are stored as SHA-256 hashes of `id:password` (lower-cased). To create one:

```bash
printf 'username:temporary-password' | sha256sum
```

Paste the result into that user's `hash:` field. On first sign-in the user must choose their own password, which is stored only in that browser (`localStorage`, key `slipdesk.pw.v1`). Officers can change it later from **Profile > Password**.

Profile details an officer edits (name, title, phone, email, photo) are stored the same way, under `slipdesk.profile.v1`. **Reset to original** on the Profile page brings back the details set in `USERS`.

## Desktop shortcut icon (Windows)

1. Right-click `slip-desk.html` > **Send to** > **Desktop (create shortcut)**.
2. Right-click the new shortcut > **Properties** > **Shortcut** tab > **Change Icon** > **Browse**.
3. Choose `assets/icons/desktop-icon.ico` (keep the folder in place or the icon reverts).

## Security and privacy notes

- Sign-in runs entirely in the browser, so it is a **deterrent, not real access control**. Anyone with the files can read or edit the account list. Do not rely on it to protect sensitive data.
- Candidate records are personal data. **Never commit register files (Excel/CSV) to this repository.**
- Report any lost device or misdirected printout to your supervising officer.

## License

Add a license here (for example MIT), or state that the project is proprietary to the issuing body.
