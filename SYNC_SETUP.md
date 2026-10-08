# Turn on sync (laptop <-> phone) - OPTIONAL, later
1. Make a free project at supabase.com.
2. SQL Editor -> paste all of `supabase/schema.sql` -> Run.
3. Authentication -> Email Templates -> **Magic Link**: make sure the body contains `{{ .Token }}` (e.g. "Your code: {{ .Token }}") so the email carries a 6-digit code.
4. Project Settings -> API: copy the Project URL and the `anon` public key into `js/config.js`. (The anon key is meant to be public; row-level security protects your rows.)
5. Upload (push) the changed `js/config.js` to GitHub. The phone picks it up the next time you open the app online.
6. In the app: Settings -> Sync -> enter your email -> type the 6-digit code. Do the same on the other device with the same email.

How it behaves: answers are saved on the device instantly; sync runs in the background and when you come back online. Each answer is an immutable event, so devices merge by union - nothing is overwritten. Only your email and quiz events are stored.
