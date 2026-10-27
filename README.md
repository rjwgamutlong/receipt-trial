# Receipt to Excel (Trial) - setup

## 1. Get a free Gemini key (for the trial)
1. Go to aistudio.google.com and sign in with a Google account.
2. Choose Get API key, then Create API key, and copy it.
3. Free keys have daily and per-minute limits, and Google may use free-tier data to improve its products.
   Use sample or blurred receipts for the trial.

(For the paid version you can switch to Claude: set PROVIDER to claude and add ANTHROPIC_API_KEY from console.anthropic.com.)

## 2. Put the project on GitHub
1. Unzip this folder.
2. Create a new private repository on github.com.
3. Upload every file, keeping the folders (public, netlify/functions).

## 3. Deploy on Netlify (free plan)
1. Sign in at netlify.com, choose Add new site, Import an existing project, then pick your GitHub repo.
2. Leave the build settings as they are (netlify.toml sets them) and deploy.
3. Go to Site configuration, Environment variables, and add:
   - GEMINI_API_KEY = your key from step 1
   - ACCESS_CODE = the trial code you will give the client, for example JADJ-TRIAL
   - TRIAL_MAX = 30
   - TRIAL_EXPIRES = a date such as 2026-11-15
4. Trigger a new deploy so the variables apply.

## 4. Test it
Open your Netlify link, enter the trial code, and add a receipt photo.
Before sending the link, check the CONTACT block near the top of the script in public/index.html.

## 5. Send to the client
Send the Netlify link and the trial code. The page locks with your contact details when the trial ends or the receipt cap is used up.

## Notes
- The page reads photos and PDF scans (one receipt per page). It exports John's format: a PUR-VAT and a PUR-NONVAT sheet for each month found in the dates.
- To restart a trial, change ACCESS_CODE to a new code. Each code has its own counter.
- If reading fails with an upstream error, the Gemini model name may have changed. Set GEMINI_MODEL to the current Flash model name shown in AI Studio (Google retires old names, which causes a 404).
- Free Netlify functions stop after about 10 seconds. If long receipts time out, tell Ray and the Function can move to a host without that limit.
- Receipt photos are sent to an outside online service to be read. Tell the client this.
