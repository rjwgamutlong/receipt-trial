# Deploy on Cloudflare Pages (free, no 10-second limit)

Use this if Netlify credits run out. Same app, same repo.

1. Sign up free at dash.cloudflare.com.
2. Left menu: Workers and Pages, Create, Pages, Connect to Git, pick the repo (branch main).
3. Build settings: Framework preset None, Build command empty, Build output directory `public`. Save and Deploy.
4. Create the trial counter: Workers and Pages, KV, Create a namespace, name it `receipt-trial`.
5. Open your Pages project, Settings, Bindings, Add, KV namespace. Variable name `TRIAL`, choose the namespace from step 4.
6. Settings, Variables and Secrets, add (as Secret for the key and code): GEMINI_API_KEY, ACCESS_CODE, TRIAL_MAX (30), TRIAL_EXPIRES (2026-11-15). Optional: GEMINI_MODEL, GEMINI_FALLBACK_MODEL.
7. Deployments, Retry deployment (so the variables and binding apply). Your link is `<project>.pages.dev`.

The page finds the right function by itself: `/api/read-receipt` on Cloudflare, `/.netlify/functions/read-receipt` on Netlify.

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
- Two modes: Purchases (receipts, exported as monthly PUR-VAT and PUR-NONVAT sheets plus ALL RECEIPTS) and Sales (Z-Readings, exported as one sheet per month in the ESALES layout, main branch first then BRANCH, plus ALL Z-READINGS). Both sheets with a master list have filters and a frozen header.
- Sales checks: the page adds up vatable, VAT, zero rated and exempt sales and compares them with net sales. A difference turns the amounts yellow.
- The ESALES TOTAL column is H+I+J+K. John's sample used H+I for the main row and H+I+K for the branch row, so confirm which he wants.
- To restart a trial, change ACCESS_CODE to a new code. Each code has its own counter.
- If reading fails with an upstream error, the Gemini model name may have changed. Set GEMINI_MODEL to the current Flash model name shown in AI Studio.
- Free Netlify functions stop after about 10 seconds. If long receipts time out, tell Ray and the Function can move to a host without that limit.
- Receipt photos are sent to an outside online service to be read. Tell the client this.
