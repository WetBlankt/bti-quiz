# Business Trade in India - Study App

A quiz app that runs completely in your browser. No server, no AI, works offline.

---

## A. Run it on your computer

1. Install Node.js from nodejs.org (one time).
2. Open a terminal **inside this folder** (the one that contains `index.html`).
3. Type:

   ```
   npm start
   ```

4. Open **http://localhost:8080** in Chrome or Edge.

(Stop it with `Ctrl + C`.)

---

## B. Put it on GitHub (and update it later)

**First time**

1. Unzip the project. You should have a folder named `bti-quiz` with `index.html` directly inside it.
2. Open **GitHub Desktop** -> **File** -> **Add local repository...** -> choose that `bti-quiz` folder.
3. It will say "not a repository" -> click **create a repository** -> keep the name `bti-quiz` -> **Create repository**.
4. Click **Publish repository**. **Untick "Keep this code private"** (GitHub Pages needs a public repository). Click **Publish**.

**Every time you change something**

1. Open GitHub Desktop. You will see the changed files.
2. Type a short message at the bottom left -> **Commit to main**.
3. Click **Push origin**.

---

## C. Turn on GitHub Pages (one time)

1. On github.com open your repository -> **Settings** -> **Pages** (left menu).
2. Under **Build and deployment** -> **Source** choose **Deploy from a branch**.
3. Under **Branch** choose **main** and the folder **/ (root)** -> **Save**.
4. Wait 1-2 minutes and refresh that page. It will say **"Your site is live at ..."**.

---

## D. Open it on your phone

Open this in **Chrome on your phone** (replace `USERNAME` with your GitHub username):

```
https://USERNAME.github.io/bti-quiz/
```

- Tap the menu (three dots) -> **Install app** (or **Add to Home screen**).
- Open it once while you have internet. After that it works offline.
- After you push an update, open the app once with internet and it updates itself (close and reopen it if it was already open).

---

### If the app is stuck or shows "The app could not start"

The screen now tells you the real reason (a file name and "HTTP 404", or an error message). Do these, in order:

1. Open `https://USERNAME.github.io/bti-quiz/js/main.js` in your browser. You should see lots of code. If you see "404", the files are not on GitHub where they should be.
2. On github.com, open your repository. The first page must list `index.html`, `js`, `css`, `data` and `icons` **directly** (not inside another folder). If you only see one folder called `bti-quiz`, you added the wrong folder: move its contents up, or re-add the inner `bti-quiz` folder in GitHub Desktop.
3. Press the **Clear cached app files & reload** button on that screen (your saved progress is NOT deleted).
4. Still stuck? Send me the lines shown on that screen.

---

### Good to know
- Your progress is saved **on each device**. The phone and the computer do not share progress yet (see `SYNC_SETUP.md` if you ever want that). To move progress: **Settings -> Export** on one device, **Import** on the other.
- If the page is blank or shows a 404, check that `index.html` is at the top of the repository, not inside another folder.
- Developer notes are in `CLAUDE.md`.
